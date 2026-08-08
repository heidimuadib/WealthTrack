import {
    pairPerspective,
    selfTotals,
    settlementRouteParams,
    sortPairs,
    summaryState,
} from '../balances';

// Member ids are uuids in production; short sortable strings here, because the
// canonical pair ordering the backend applies is "the two ids, sorted", and a
// test that hid that would not be testing the shape the API actually sends.
const PAUL = { id: 'm-self', name: 'Paul' };
const JOHN = { id: 'm-john', name: 'John' };
const MIKE = { id: 'm-mike', name: 'Mike' };
const ANNE = { id: 'm-anne', name: 'Anne' };

// Shaped exactly as describePair() serialises it: the two members in sorted id
// order, an always-positive balance, and the direction said separately.
const pair = (one, two, balance, debtor) => {
    const [a, b] = one.id < two.id ? [one, two] : [two, one];
    const creditor = debtor.id === a.id ? b : a;

    return {
        memberAId: a.id,
        memberAName: a.name,
        memberBId: b.id,
        memberBName: b.name,
        balance,
        direction: { fromMemberId: debtor.id, toMemberId: creditor.id },
    };
};

// The server's own two totals, added up the way the server adds them up: gross
// positions read off the pair rows, in centavos, direction by direction.
//
// They were once max(net, 0) and max(-net, 0), so at most one could be non-zero
// and neither matched the rows beneath it. No response has looked like that
// since ebaedf4, and a fixture still shaped that way would let a screen that
// trusted the server's totals pass here and be wrong in front of somebody.
const grossTotals = (pairs, selfId) => {
    const cents = (peso) => Math.round(peso * 100);
    let owed = 0;
    let owing = 0;

    pairs.forEach(({ balance, direction }) => {
        if (direction.toMemberId === selfId) {
            owed += cents(balance);
        } else if (direction.fromMemberId === selfId) {
            owing += cents(balance);
        }
    });

    return { youAreOwed: owed / 100, youOwe: owing / 100 };
};

const view = (pairs, netBalance = 0) => ({
    groupId: 'g-1',
    currentUserMemberId: PAUL.id,
    ...grossTotals(pairs, PAUL.id),
    netBalance,
    members: [],
    pairs,
});

describe('pairPerspective', () => {
    it('reads a debt owed to the reader as owed to them', () => {
        const result = pairPerspective(pair(PAUL, JOHN, 100, JOHN), PAUL.id);

        expect(result).toEqual({ kind: 'owedToYou', otherId: JOHN.id, otherName: 'John' });
    });

    it('reads a debt the reader owes as one they owe', () => {
        const result = pairPerspective(pair(PAUL, ANNE, 300, PAUL), PAUL.id);

        expect(result).toEqual({ kind: 'youOwe', otherId: ANNE.id, otherName: 'Anne' });
    });

    it('names both people when the reader is on neither side', () => {
        const result = pairPerspective(pair(JOHN, MIKE, 50, JOHN), PAUL.id);

        expect(result).toEqual({ kind: 'thirdParty', debtorName: 'John', creditorName: 'Mike' });
    });

    // The two ids are stored sorted, so which of them owes has nothing to do
    // with which one is memberA. Reading direction is the only way to be right.
    it('follows direction rather than the order the ids happen to be stored in', () => {
        const owedToPaul = pair(PAUL, JOHN, 100, JOHN);
        const owedByPaul = pair(PAUL, JOHN, 100, PAUL);

        expect(owedToPaul.memberAId).toBe(owedByPaul.memberAId);
        expect(pairPerspective(owedToPaul, PAUL.id).kind).toBe('owedToYou');
        expect(pairPerspective(owedByPaul, PAUL.id).kind).toBe('youOwe');
    });

    it('treats every pair as third party when the group has no self member', () => {
        expect(pairPerspective(pair(PAUL, JOHN, 100, JOHN), null).kind).toBe('thirdParty');
    });
});

describe('sortPairs', () => {
    it('puts the reader’s own balances above everybody else’s', () => {
        const mine = pair(PAUL, ANNE, 20, ANNE);
        const theirs = pair(JOHN, MIKE, 900, JOHN);

        expect(sortPairs([theirs, mine], PAUL.id).map((p) => p.balance)).toEqual([20, 900]);
    });

    it('leads with the largest amount within each group', () => {
        const small = pair(PAUL, ANNE, 20, ANNE);
        const large = pair(PAUL, JOHN, 400, JOHN);

        expect(sortPairs([small, large], PAUL.id).map((p) => p.balance)).toEqual([400, 20]);
    });

    it('breaks ties on ids so the same balances never swap places', () => {
        const first = pair(JOHN, MIKE, 100, JOHN);
        const second = pair(ANNE, MIKE, 100, ANNE);

        const once = sortPairs([first, second], PAUL.id);
        const again = sortPairs([second, first], PAUL.id);

        expect(once.map((p) => p.memberAId)).toEqual(again.map((p) => p.memberAId));
        expect(once[0].memberAId).toBe(ANNE.id);
    });

    it('does not mutate what it was handed', () => {
        const input = [pair(JOHN, MIKE, 10, JOHN), pair(PAUL, ANNE, 20, ANNE)];
        const copy = [...input];
        sortPairs(input, PAUL.id);

        expect(input).toEqual(copy);
    });
});

describe('selfTotals', () => {
    // The Phase 6A.1 worked example, asserted against the fixture itself rather
    // than only through selfTotals: John owes the reader ₱500, the reader owes
    // Anne ₱300, and the server says all three figures out loud. If this
    // fixture ever drifts back to netting the two together, this fails here
    // instead of quietly weakening every test built on top of it.
    it('is built on a response that reports both directions gross', () => {
        const balances = view([pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)], 200);

        expect(balances.youAreOwed).toBe(500);
        expect(balances.youOwe).toBe(300);
        expect(balances.netBalance).toBe(200);

        const [owedToPaul, owedToAnne] = balances.pairs;
        expect(owedToPaul.balance).toBe(500);
        expect(owedToPaul.direction).toEqual({ fromMemberId: JOHN.id, toMemberId: PAUL.id });
        expect(owedToAnne.balance).toBe(300);
        expect(owedToAnne.direction).toEqual({ fromMemberId: PAUL.id, toMemberId: ANNE.id });
    });

    // Summed here as well as on the server, deliberately: the summary is then
    // provably the total of the rows displayed beneath it, whatever the server
    // sent. The two agreeing is asserted immediately below.
    it('adds up both sides of the reader’s position', () => {
        const balances = view([pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)], 200);

        expect(selfTotals(balances)).toEqual({ owedToYou: 500, youOwe: 300, net: 200 });
    });

    it('lands on the same two figures the server sent', () => {
        const balances = view([pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)], 200);
        const { owedToYou, youOwe } = selfTotals(balances);

        expect(owedToYou).toBe(balances.youAreOwed);
        expect(youOwe).toBe(balances.youOwe);
    });

    it('reconciles with the net the server worked out', () => {
        const balances = view([pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)], 200);
        const { owedToYou, youOwe, net } = selfTotals(balances);

        expect(owedToYou - youOwe).toBe(net);
    });

    it('ignores balances between other people', () => {
        const balances = view([pair(JOHN, MIKE, 900, JOHN)], 0);

        expect(selfTotals(balances)).toEqual({ owedToYou: 0, youOwe: 0, net: 0 });
    });

    // Peso amounts arrive as doubles; three ten-centavo debts summed as doubles
    // are ₱0.30000000000000004, which would render one centavo out.
    it('adds centavos exactly rather than drifting through doubles', () => {
        const balances = view(
            [
                pair(PAUL, JOHN, 0.1, JOHN),
                pair(PAUL, MIKE, 0.1, MIKE),
                pair(PAUL, ANNE, 0.1, ANNE),
            ],
            0.3
        );

        expect(selfTotals(balances).owedToYou).toBe(0.3);
    });

    it('answers zero rather than throwing on a response that has not arrived', () => {
        expect(selfTotals(undefined)).toEqual({ owedToYou: 0, youOwe: 0, net: 0 });
    });
});

describe('summaryState', () => {
    it('knows the reader is only owed', () => {
        expect(summaryState(view([pair(PAUL, JOHN, 400, JOHN)], 400))).toBe('owedOnly');
    });

    it('knows the reader only owes', () => {
        expect(summaryState(view([pair(PAUL, ANNE, 300, PAUL)], -300))).toBe('owesOnly');
    });

    it('knows the reader is on both sides', () => {
        const balances = view([pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)], 200);

        expect(summaryState(balances)).toBe('both');
    });

    it('calls a group with nothing outstanding settled', () => {
        expect(summaryState(view([], 0))).toBe('allSettled');
    });

    // The distinction that matters: the reader is clear, the group is not.
    it('does not call the group settled when only the reader is', () => {
        expect(summaryState(view([pair(JOHN, MIKE, 100, JOHN)], 0))).toBe('youSettled');
    });

    it('separates nothing owed from nothing spent', () => {
        expect(summaryState(view([], 0), { expensesAreKnownEmpty: true })).toBe('noBalances');
    });

    // Expenses still loading is not the same as expenses being empty, and
    // guessing would put "balances will appear after a shared expense" on a
    // group that has fifty of them.
    it('does not claim a group is empty while its expenses are unknown', () => {
        expect(summaryState(view([], 0), { expensesAreKnownEmpty: false })).toBe('allSettled');
    });
});

describe('settlementRouteParams', () => {
    it('carries the ids the settlement screen needs', () => {
        const params = settlementRouteParams('g-1', pair(PAUL, JOHN, 100, JOHN));

        expect(params).toEqual({
            groupId: 'g-1',
            fromMemberId: JOHN.id,
            toMemberId: PAUL.id,
        });
    });

    it('points the repayment the way the debt runs', () => {
        const params = settlementRouteParams('g-1', pair(PAUL, ANNE, 300, PAUL));

        expect(params.fromMemberId).toBe(PAUL.id);
        expect(params.toMemberId).toBe(ANNE.id);
    });

    // Navigation state is held in memory, serialised by devtools and restored
    // across reloads. Somebody's name and what they owe belong in none of that.
    it('carries nothing but ids — no names, no amounts', () => {
        const params = settlementRouteParams('g-1', pair(PAUL, JOHN, 100, JOHN));

        expect(Object.keys(params).sort()).toEqual(['fromMemberId', 'groupId', 'toMemberId']);
        expect(JSON.stringify(params)).not.toMatch(/John|Paul|100/);
    });
});
