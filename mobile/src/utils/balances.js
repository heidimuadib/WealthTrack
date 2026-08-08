// Presentation over the balance engine, and nothing more.
//
// Every debt and every direction arrives from GET /balances already decided.
// This file is allowed to order those rows, add up ones that are already
// decided, and choose the sentence that says them out loud. It may not work out
// who owes whom, subtract a settlement, or read a balance out of an expense —
// the server does all of that, and a client that did it too would eventually
// disagree with the ledger in front of somebody who is owed money.

export const SETTLEMENT_ROUTE = 'RecordSettlement';

// Peso amounts cross the API as numbers, which is fine to render and unsafe to
// add: three ₱0.10 shares summed as doubles are ₱0.30000000000000004. Totals
// are therefore accumulated as whole centavos and handed back as pesos, so the
// figure on the summary is the one the pair rows underneath add up to.
const toCentavos = (peso) => Math.round((Number(peso) || 0) * 100);
const toPeso = (centavos) => centavos / 100;

// Which way a pair runs, from the reader's seat.
//
// `direction` is the backend's own answer and the only thing consulted. The
// `balance` field is always positive by construction, so there is no sign here
// to misread — which is exactly why the backend sends the two separately.
export const pairPerspective = (pair, currentUserMemberId) => {
    const { fromMemberId, toMemberId } = pair.direction;

    const nameOf = (memberId) =>
        memberId === pair.memberAId ? pair.memberAName : pair.memberBName;

    const debtorName = nameOf(fromMemberId);
    const creditorName = nameOf(toMemberId);

    if (currentUserMemberId && toMemberId === currentUserMemberId) {
        return { kind: 'owedToYou', otherId: fromMemberId, otherName: debtorName };
    }

    if (currentUserMemberId && fromMemberId === currentUserMemberId) {
        return { kind: 'youOwe', otherId: toMemberId, otherName: creditorName };
    }

    return { kind: 'thirdParty', debtorName, creditorName };
};

const involvesUser = (pair, currentUserMemberId) =>
    Boolean(currentUserMemberId) &&
    (pair.direction.fromMemberId === currentUserMemberId ||
        pair.direction.toMemberId === currentUserMemberId);

// Presentation order, not ledger order.
//
// The reader's own debts come first: a screen that buried "you owe Anne ₱300"
// under two balances between other people would have answered the wrong
// question first. Larger amounts lead within each group, and the canonical ids
// break ties so the same balances never swap places between renders.
export const sortPairs = (pairs = [], currentUserMemberId = null) =>
    [...pairs].sort((a, b) => {
        const mine = involvesUser(a, currentUserMemberId);
        const theirs = involvesUser(b, currentUserMemberId);
        if (mine !== theirs) {
            return mine ? -1 : 1;
        }

        const byAmount = toCentavos(b.balance) - toCentavos(a.balance);
        if (byAmount !== 0) {
            return byAmount;
        }

        if (a.memberAId !== b.memberAId) {
            return a.memberAId < b.memberAId ? -1 : 1;
        }
        return a.memberBId < b.memberBId ? -1 : a.memberBId > b.memberBId ? 1 : 0;
    });

// What the reader is owed and what they owe, as two gross figures.
//
// The API sends these two as well, and since the backend contract correction
// they agree with what this works out. Summing here anyway is not distrust of
// the server — it is what makes the summary provably the total of the rows
// rendered directly beneath it, so the two cannot disagree on screen whatever
// arrives. It invents no obligation either: every addend is a balance the
// backend decided, settlements included.
//
// The history is worth keeping: both figures used to be cut from one net
// number — max(net, 0) and max(-net, 0) — so at most one was ever non-zero, and
// somebody owed ₱500 by John while owing Anne ₱300 was told they owed nothing
// above rows that said otherwise. That is the bug this function was written to
// route around, and it is fixed at the source now.
//
// netBalance is still taken from the server verbatim rather than subtracted
// here. The two must reconcile — owedToYou - youOwe === netBalance — and that
// is asserted in the tests rather than assumed.
export const selfTotals = (balances) => {
    const currentUserMemberId = balances?.currentUserMemberId ?? null;
    const pairs = balances?.pairs ?? [];

    let owedCentavos = 0;
    let owingCentavos = 0;

    pairs.forEach((pair) => {
        const { kind } = pairPerspective(pair, currentUserMemberId);
        if (kind === 'owedToYou') {
            owedCentavos += toCentavos(pair.balance);
        } else if (kind === 'youOwe') {
            owingCentavos += toCentavos(pair.balance);
        }
    });

    return {
        owedToYou: toPeso(owedCentavos),
        youOwe: toPeso(owingCentavos),
        net: Number(balances?.netBalance) || 0,
    };
};

// Which of the seven things a summary can be saying.
//
// `expensesAreKnownEmpty` is the one fact the balances endpoint cannot supply:
// no pairs because nobody owes anybody reads very differently from no pairs
// because nothing has been spent yet. The group screen already holds the
// expense list, so the distinction costs no request. Left false when the
// expenses are still loading or failed, which lands on "all settled" — true of
// the balance data actually in hand, and never a claim about spending.
export const summaryState = (balances, { expensesAreKnownEmpty = false } = {}) => {
    const pairs = balances?.pairs ?? [];
    const { owedToYou, youOwe } = selfTotals(balances);

    if (pairs.length === 0) {
        return expensesAreKnownEmpty ? 'noBalances' : 'allSettled';
    }

    if (owedToYou === 0 && youOwe === 0) {
        // Other people owe each other, but nothing touches the reader. Saying
        // "all settled" here would be a lie about the group; saying nothing
        // would be a gap where their own position should be.
        return 'youSettled';
    }

    if (owedToYou > 0 && youOwe > 0) {
        return 'both';
    }

    return owedToYou > 0 ? 'owedOnly' : 'owesOnly';
};

// Ids only. A route param is written into navigation state, which is held in
// memory, serialised by the devtools and restored across a reload — no place
// for somebody's name or what they owe. The screen it opens reads both from the
// balances it fetches for itself.
export const settlementRouteParams = (groupId, pair) => ({
    groupId,
    fromMemberId: pair.direction.fromMemberId,
    toMemberId: pair.direction.toMemberId,
});
