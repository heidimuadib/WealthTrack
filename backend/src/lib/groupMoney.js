// Every figure in a group is money somebody expects back, so none of the
// arithmetic below touches a floating-point number.
//
// The unit throughout is the centavo, as an integer. Decimal(12,2) tops out at
// ₱9,999,999,999.99, which is 999,999,999,999 centavos — four orders of
// magnitude below Number.MAX_SAFE_INTEGER, so ordinary integers hold every
// value this app can store, exactly, with room to add thousands of them
// together before anything could drift. That is the whole reason to work in
// centavos rather than reaching for a decimal library: the exactness is a
// property of the representation rather than of a dependency.
//
// Conversion happens once, at the edges. Values arrive as strings, numbers or
// Prisma Decimals, become integers here, and only turn back into decimal
// strings on the way to the database. Nothing in between is allowed to be
// fractional, because a fraction of a centavo is not money — it is a rounding
// argument waiting to happen in front of somebody who is owed ₱100.

// ₱9,999,999,999.99 — the largest value the Decimal(12,2) columns can hold.
const MAX_CENTAVOS = 999999999999;

// Deliberately not a plain string match. `String(0.1 + 0.2)` is
// "0.30000000000000004", and a caller who did float arithmetic before reaching
// this function has already lost centavos — refusing the value is how they find
// out, rather than having it silently rounded back into something plausible.
const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

const fail = (message) => {
    const error = new Error(message);
    error.code = 'INVALID_MONEY';
    throw error;
};

const isSafeInteger = (value) => typeof value === 'number' && Number.isSafeInteger(value);

// Accepts a string, a number, or anything with a toString that produces a plain
// decimal — which is what a Prisma Decimal gives. Returns integer centavos.
//
// Three or more decimal places are refused rather than rounded. The column
// cannot store them, the keypad cannot produce them, and quietly turning
// ₱1.005 into ₱1.01 is the app deciding on its own who gets the extra centavo.
const toCentavos = (value) => {
    if (value === null || value === undefined) {
        fail('Amount is required');
    }

    // Rejects NaN and both infinities before they can be stringified into
    // something the pattern would have to reason about.
    if (typeof value === 'number' && !Number.isFinite(value)) {
        fail(`Amount is not a finite number: ${value}`);
    }

    const text = String(value).trim();
    const match = MONEY_PATTERN.exec(text);

    if (!match) {
        fail(`Amount is not a valid money value: ${text}`);
    }

    const [, sign, whole, fraction = ''] = match;
    const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

    if (!Number.isSafeInteger(centavos)) {
        fail(`Amount is too large to represent exactly: ${text}`);
    }

    const signed = sign === '-' ? -centavos : centavos;

    if (Math.abs(signed) > MAX_CENTAVOS) {
        fail(`Amount is outside the storable range: ${text}`);
    }

    return signed;
};

// Back to a decimal string, which is what Prisma wants for a Decimal column —
// a string rather than a number, so the value never passes through a double on
// its way to the database.
const fromCentavos = (centavos) => {
    if (!isSafeInteger(centavos)) {
        fail(`Centavos must be a safe integer: ${centavos}`);
    }

    const sign = centavos < 0 ? '-' : '';
    const absolute = Math.abs(centavos);

    return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
};

const assertPositiveTotal = (totalCentavos) => {
    if (!isSafeInteger(totalCentavos)) {
        fail(`Total must be a safe integer number of centavos: ${totalCentavos}`);
    }
    if (totalCentavos <= 0) {
        fail('Total must be greater than zero');
    }
    if (totalCentavos > MAX_CENTAVOS) {
        fail('Total is outside the storable range');
    }
};

const assertMemberIds = (memberIds) => {
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
        fail('At least one participant is required');
    }

    memberIds.forEach((id) => {
        if (typeof id !== 'string' || id.trim() === '') {
            fail('Every participant needs an id');
        }
    });

    if (new Set(memberIds).size !== memberIds.length) {
        fail('A participant cannot appear twice');
    }
};

// Divides a bill evenly and hands out the centavos that will not divide.
//
// ₱100 among three is 3333.33 centavos each, which is not a thing. Somebody has
// to pay ₱33.34, and which somebody has to be decided the same way every time
// or a recalculated bill would quietly move a centavo between two people. The
// rule: sort the participants by id and give the odd centavos to the earliest
// ones. Ids are uuids — stable, unique, and not something the client chooses
// the order of, which is exactly what the incoming array is.
const splitEqual = (totalCentavos, memberIds) => {
    assertPositiveTotal(totalCentavos);
    assertMemberIds(memberIds);

    const ordered = [...memberIds].sort();
    const count = ordered.length;
    const base = Math.floor(totalCentavos / count);
    const remainder = totalCentavos - base * count;

    return ordered.map((memberId, index) => ({
        memberId,
        amountCentavos: base + (index < remainder ? 1 : 0),
    }));
};

// Checks a split the user typed themselves, and refuses anything that does not
// add up. It does not adjust, round, or absorb a difference into the last
// participant: a bill that is ₱5 short is a question for the person splitting
// it, and answering it silently is how an app ends up disagreeing with the
// people using it about what somebody owes.
//
// Zero is allowed. Somebody who came along but did not eat still belongs on the
// bill — leaving them off loses the record that they were there.
const validateCustomSplit = (totalCentavos, shares) => {
    assertPositiveTotal(totalCentavos);

    if (!Array.isArray(shares) || shares.length === 0) {
        fail('At least one participant is required');
    }

    assertMemberIds(shares.map((share) => share?.memberId));

    let sum = 0;

    shares.forEach(({ memberId, amountCentavos }) => {
        if (!isSafeInteger(amountCentavos)) {
            fail(`Share for ${memberId} must be a safe integer number of centavos`);
        }
        if (amountCentavos < 0) {
            fail(`Share for ${memberId} cannot be negative`);
        }
        if (amountCentavos > MAX_CENTAVOS) {
            fail(`Share for ${memberId} is outside the storable range`);
        }
        sum += amountCentavos;
    });

    if (sum !== totalCentavos) {
        fail(
            `Shares add up to ${fromCentavos(sum)}, but the total is ${fromCentavos(totalCentavos)}`
        );
    }

    return [...shares]
        .map(({ memberId, amountCentavos }) => ({ memberId, amountCentavos }))
        .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
};

// Every expense must already be internally consistent before any balance can be
// believed. A bill whose shares do not sum to its total would put the group's
// net balances permanently off zero, and the error would surface later as an
// amount nobody can explain — so it is caught at the door instead.
const assertExpensesAddUp = (expenses) => {
    expenses.forEach((expense, index) => {
        const shares = expense?.shares ?? [];
        const sum = shares.reduce((running, share) => running + share.amountCentavos, 0);

        if (sum !== expense.amountCentavos) {
            fail(
                `Expense ${expense.id ?? `at index ${index}`} has shares totalling ` +
                    `${fromCentavos(sum)} but an amount of ${fromCentavos(expense.amountCentavos)}`
            );
        }
    });
};

const blankBalance = (memberId) => ({
    memberId,
    paidCentavos: 0,
    owedCentavos: 0,
    sentCentavos: 0,
    receivedCentavos: 0,
    netCentavos: 0,
});

// What each member has put in and taken out, reduced to one signed number.
//
//   net = paid - owed + sentOut - received
//
// Positive means the member is owed money, negative means they owe it. Across a
// whole group the nets must cancel to exactly zero — every peso one member is
// owed is a peso another member owes — and that is asserted rather than assumed,
// because a non-zero sum means the input was malformed and every figure derived
// from it is wrong.
const calculateMemberBalances = (expenses = [], settlements = []) => {
    assertExpensesAddUp(expenses);

    const balances = new Map();
    const balanceFor = (memberId) => {
        if (!balances.has(memberId)) {
            balances.set(memberId, blankBalance(memberId));
        }
        return balances.get(memberId);
    };

    expenses.forEach((expense) => {
        balanceFor(expense.payerMemberId).paidCentavos += expense.amountCentavos;
        (expense.shares ?? []).forEach((share) => {
            balanceFor(share.memberId).owedCentavos += share.amountCentavos;
        });
    });

    settlements.forEach((settlement) => {
        if (!isSafeInteger(settlement.amountCentavos) || settlement.amountCentavos <= 0) {
            fail('A settlement must be a positive whole number of centavos');
        }
        if (settlement.fromMemberId === settlement.toMemberId) {
            fail('A settlement cannot be from a member to themselves');
        }
        balanceFor(settlement.fromMemberId).sentCentavos += settlement.amountCentavos;
        balanceFor(settlement.toMemberId).receivedCentavos += settlement.amountCentavos;
    });

    const result = [...balances.values()]
        .map((balance) => ({
            ...balance,
            netCentavos:
                balance.paidCentavos -
                balance.owedCentavos +
                balance.sentCentavos -
                balance.receivedCentavos,
        }))
        .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));

    const total = result.reduce((running, balance) => running + balance.netCentavos, 0);

    if (total !== 0) {
        fail(`Balances do not cancel out: they sum to ${fromCentavos(total)} rather than zero`);
    }

    return result;
};

// Who owes whom, rather than who is up or down overall.
//
// This is answerable exactly because a shared expense has one payer: every
// share on it is a debt from that participant to that payer, with nothing to
// untangle. Settlements move the balance back the other way.
//
// Each pair is stored once, under the two ids in sorted order, and the sign
// carries the direction:
//
//   balanceCentavos > 0  ->  memberA owes memberB
//   balanceCentavos < 0  ->  memberB owes memberA
//
// Pairs that come out level are left out entirely — a settled pair is not a
// balance, and listing it as zero invites a screen to render "owes ₱0.00".
const calculatePairwiseBalances = (expenses = [], settlements = []) => {
    assertExpensesAddUp(expenses);

    // "a owes b" accumulated under a single key per ordered pair.
    const owed = new Map();
    const key = (from, to) => `${from} ${to}`;

    const add = (from, to, amountCentavos) => {
        if (from === to) {
            return;
        }
        owed.set(key(from, to), (owed.get(key(from, to)) ?? 0) + amountCentavos);
    };

    expenses.forEach((expense) => {
        (expense.shares ?? []).forEach((share) => {
            add(share.memberId, expense.payerMemberId, share.amountCentavos);
        });
    });

    settlements.forEach((settlement) => {
        // Paying somebody reduces what you owe them, which is the same as them
        // owing you that much — the subtraction falls out of the pair maths
        // below rather than needing a case of its own.
        add(settlement.toMemberId, settlement.fromMemberId, settlement.amountCentavos);
    });

    const pairs = new Map();

    owed.forEach((amount, pairKey) => {
        const [from, to] = pairKey.split(' ');
        const [memberAId, memberBId] = from < to ? [from, to] : [to, from];
        const canonical = key(memberAId, memberBId);
        // Signed towards the canonical direction: a debt from A to B counts up,
        // a debt from B to A counts down.
        const signed = from === memberAId ? amount : -amount;

        pairs.set(canonical, {
            memberAId,
            memberBId,
            balanceCentavos: (pairs.get(canonical)?.balanceCentavos ?? 0) + signed,
        });
    });

    return [...pairs.values()]
        .filter((pair) => pair.balanceCentavos !== 0)
        .sort((a, b) =>
            a.memberAId === b.memberAId
                ? a.memberBId < b.memberBId
                    ? -1
                    : 1
                : a.memberAId < b.memberAId
                  ? -1
                  : 1
        );
};

// What a single member owes, or is owed by, one other member — read out of the
// canonical pairs above with the sign turned to face the member being asked
// about. Positive means `memberId` owes `otherMemberId`.
const pairBalanceFor = (pairs, memberId, otherMemberId) => {
    const found = pairs.find(
        (pair) =>
            (pair.memberAId === memberId && pair.memberBId === otherMemberId) ||
            (pair.memberAId === otherMemberId && pair.memberBId === memberId)
    );

    if (!found) {
        return 0;
    }

    return found.memberAId === memberId ? found.balanceCentavos : -found.balanceCentavos;
};

module.exports = {
    MAX_CENTAVOS,
    toCentavos,
    fromCentavos,
    splitEqual,
    validateCustomSplit,
    calculateMemberBalances,
    calculatePairwiseBalances,
    pairBalanceFor,
};
