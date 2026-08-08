const {
    toCentavos,
    fromCentavos,
    calculateMemberBalances,
    calculatePairwiseBalances,
    pairBalanceFor,
} = require('./groupMoney');

// The boundary between the database and the pure arithmetic in groupMoney.js.
//
// Nothing here decides what a balance is — that lives in the pure functions,
// which know nothing about Prisma and can be tested as values in, values out.
// This module's whole job is to load the rows, turn every amount into integer
// centavos exactly once, hand them over, and shape the answer for the API.
//
// Balances are derived on every read and stored nowhere. A cached balance is a
// number that can disagree with the rows it came from, and the first time it
// does, somebody is told they are owed money they are not. Deriving costs three
// indexed queries over a handful of rows; being wrong costs trust.

// Amounts leave this API as peso numbers, matching every existing endpoint —
// the client already reduces over expense.amount and would have to learn a
// second unit otherwise. Centavos never escape this file's callers.
const toPeso = (centavos) => Number(fromCentavos(centavos));

const ZERO = {
    paidCentavos: 0,
    owedCentavos: 0,
    sentCentavos: 0,
    receivedCentavos: 0,
    netCentavos: 0,
};

// Three queries, all scoped to a group whose ownership the caller has already
// proven. Shares ride along with their expenses rather than being fetched per
// expense, which is the N+1 this would otherwise be.
const loadLedger = async (client, groupId) => {
    const [members, expenses, settlements] = await Promise.all([
        client.groupMember.findMany({ where: { groupId } }),
        client.sharedExpense.findMany({ where: { groupId }, include: { shares: true } }),
        client.settlement.findMany({ where: { groupId } }),
    ]);

    return { members, expenses, settlements };
};

// Converted once, here, and never again. `excludeSettlementId` is what makes
// editing a repayment possible: the row being replaced has to come out of the
// sum before the replacement is measured against it, or a ₱40 payment being
// raised to ₱60 would be compared against a balance that already counts the
// ₱40 and refused as an overpayment.
const normalize = ({ expenses, settlements }, { excludeSettlementId = null } = {}) => ({
    expenses: expenses.map((expense) => ({
        id: expense.id,
        payerMemberId: expense.payerMemberId,
        amountCentavos: toCentavos(expense.amount),
        shares: (expense.shares ?? []).map((share) => ({
            memberId: share.memberId,
            amountCentavos: toCentavos(share.amount),
        })),
    })),
    settlements: settlements
        .filter((settlement) => settlement.id !== excludeSettlementId)
        .map((settlement) => ({
            fromMemberId: settlement.fromMemberId,
            toMemberId: settlement.toMemberId,
            amountCentavos: toCentavos(settlement.amount),
        })),
});

// The pure utilities only mention members who appear on a bill or a repayment.
// A group screen has to show everybody, including whoever has not spent
// anything yet, so the two are merged here rather than in a controller.
const buildBalances = (ledger, options = {}) => {
    const normalized = normalize(ledger, options);
    const computed = calculateMemberBalances(normalized.expenses, normalized.settlements);
    const pairs = calculatePairwiseBalances(normalized.expenses, normalized.settlements);
    const byMember = new Map(computed.map((balance) => [balance.memberId, balance]));

    const members = ledger.members.map((member) => ({
        member,
        ...ZERO,
        ...(byMember.get(member.id) ?? {}),
    }));

    return { members, pairs };
};

// Which way a pair's debt runs, read out of the sign exactly once.
//
// The canonical row keeps the two ids in sorted order so a pair is stored once
// and never twice; the sign says who owes whom. Everything downstream — the
// pair rows in the response and the reader's own totals — asks this function
// instead of looking at the sign again, because a second reading is a second
// chance to get it backwards.
const directionOf = (pair) => {
    const aOwesB = pair.balanceCentavos > 0;

    return {
        fromMemberId: aOwesB ? pair.memberAId : pair.memberBId,
        toMemberId: aOwesB ? pair.memberBId : pair.memberAId,
        // Always positive. The direction carries the meaning.
        amountCentavos: Math.abs(pair.balanceCentavos),
    };
};

// A pair, said out loud. Leaving a client to work the direction out from a
// negative number is how a screen ends up rendering "Paul owes John -₱100".
const describePair = (pair, nameOf) => {
    const { fromMemberId, toMemberId, amountCentavos } = directionOf(pair);

    return {
        memberAId: pair.memberAId,
        memberAName: nameOf(pair.memberAId),
        memberBId: pair.memberBId,
        memberBName: nameOf(pair.memberBId),
        balance: toPeso(amountCentavos),
        direction: { fromMemberId, toMemberId },
    };
};

// What one member is owed and what they owe, as two independent gross figures.
//
// These are not two halves of the net. Somebody owed ₱500 by John while owing
// Anne ₱300 nets ₱200, and reporting that as "you are owed ₱200, you owe ₱0"
// erases both real debts behind their difference — the summary would then
// disagree with the pair rows sitting directly beneath it, which are the rows
// the reader settles one at a time. Both figures are added up from those same
// pair rows, so the two cannot drift apart.
//
// Third-party debts are skipped rather than netted in: what John owes Mike is
// not money this member is owed, and it is not money they owe.
const grossPositionsFor = (pairs, memberId) =>
    pairs.reduce(
        (totals, pair) => {
            const { fromMemberId, toMemberId, amountCentavos } = directionOf(pair);

            if (toMemberId === memberId) {
                totals.owedCentavos += amountCentavos;
            } else if (fromMemberId === memberId) {
                totals.owingCentavos += amountCentavos;
            }

            return totals;
        },
        { owedCentavos: 0, owingCentavos: 0 }
    );

// Everything GET /balances answers, ready to serialise.
const groupBalanceView = async (client, group) => {
    const ledger = await loadLedger(client, group.id);
    const { members, pairs } = buildBalances(ledger);

    const nameOf = (id) => ledger.members.find((member) => member.id === id)?.name ?? null;
    const self = members.find((entry) => entry.member.isCurrentUser);
    const selfMemberId = self?.member.id ?? null;
    const selfNet = self?.netCentavos ?? 0;
    const { owedCentavos, owingCentavos } = grossPositionsFor(pairs, selfMemberId);

    return {
        groupId: group.id,
        currentUserMemberId: selfMemberId,
        // Two gross positions, both non-negative, and either or both can be
        // non-zero at once. netBalance is still the member's own net from the
        // balance engine rather than the difference computed here — the two
        // routes to it must agree, and the tests assert that they do.
        youAreOwed: toPeso(owedCentavos),
        youOwe: toPeso(owingCentavos),
        netBalance: toPeso(selfNet),
        members: members
            .map((entry) => ({
                memberId: entry.member.id,
                name: entry.member.name,
                isCurrentUser: entry.member.isCurrentUser,
                // Archived members stay in the ledger. They were on the bills,
                // and dropping them would change what the history says.
                archivedAt: entry.member.archivedAt,
                paid: toPeso(entry.paidCentavos),
                owed: toPeso(entry.owedCentavos),
                sentOut: toPeso(entry.sentCentavos),
                received: toPeso(entry.receivedCentavos),
                netBalance: toPeso(entry.netCentavos),
            }))
            .sort((a, b) => {
                if (a.isCurrentUser !== b.isCurrentUser) {
                    return a.isCurrentUser ? -1 : 1;
                }
                return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
            }),
        // Settled pairs are absent rather than zero: a pair that owes nothing
        // is not a balance, and listing it invites a row reading "owes ₱0.00".
        pairs: pairs.map((pair) => describePair(pair, nameOf)),
    };
};

// What `fromMemberId` currently owes `toMemberId`, in centavos. Positive means
// the debt runs that way and a repayment is possible; zero or negative means it
// does not. This is the single source of the overpayment rule.
const directedPairBalanceCentavos = async (client, groupId, fromMemberId, toMemberId, options) => {
    const ledger = await loadLedger(client, groupId);
    const { pairs } = buildBalances(ledger, options);

    return pairBalanceFor(pairs, fromMemberId, toMemberId);
};

module.exports = {
    toPeso,
    loadLedger,
    normalize,
    buildBalances,
    describePair,
    groupBalanceView,
    directedPairBalanceCentavos,
};
