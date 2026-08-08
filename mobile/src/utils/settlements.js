import { toCentavos } from './splitMath';

// Everything a settlement screen needs to know, worked out from the balances
// the server already sent.
//
// The one rule that matters here: this file never decides what is owed. It
// reads the directed pair the backend published, and the only arithmetic it
// does is subtracting a payment the user is currently typing from that figure
// so the screen can say what will be left. Nothing is recomputed from expenses,
// no settlement is subtracted twice, and a debt is never invented in a
// direction the server did not report.
//
// Integer centavos throughout. A payment of ₱0.10 against a ₱0.30 debt has to
// leave ₱0.20, and in floating point it leaves ₱0.19999999999999998.

const toPeso = (centavos) => centavos / 100;

// The pair covering these two members, whichever way round the server stored
// it. Pair ids are sorted canonically, so a caller asking about "from John to
// Paul" must still find the row filed as {A: John, B: Paul} or {A: Paul, B: John}.
export const findPair = (balances, fromMemberId, toMemberId) =>
    (balances?.pairs ?? []).find(
        (pair) =>
            (pair.memberAId === fromMemberId && pair.memberBId === toMemberId) ||
            (pair.memberAId === toMemberId && pair.memberBId === fromMemberId)
    ) ?? null;

// What `fromMemberId` owes `toMemberId` right now, signed, in centavos.
//
// Positive means the debt runs the way the caller asked and a payment is
// possible. Negative means the pair exists but points the other way — which a
// settled-then-respent pair really can do — and zero means there is no pair at
// all. The sign is what makes the edit maximum below fall out correctly instead
// of needing cases.
export const directedBalanceCentavos = (balances, fromMemberId, toMemberId) => {
    const pair = findPair(balances, fromMemberId, toMemberId);
    if (!pair) {
        return 0;
    }

    const magnitude = toCentavos(pair.balance) ?? 0;
    return pair.direction.fromMemberId === fromMemberId ? magnitude : -magnitude;
};

// The most a new payment may be, in centavos. Zero or less means there is
// nothing to settle in this direction and the screen says so rather than
// offering a form that cannot succeed.
export const recordMaximumCentavos = (balances, fromMemberId, toMemberId) =>
    directedBalanceCentavos(balances, fromMemberId, toMemberId);

// The most an existing payment may be raised to, in centavos.
//
// This is the subtle one. The balances on screen already have this payment
// taken off them, so limiting an edit to what is currently outstanding would
// refuse to raise a ₱40 payment to ₱60 against an original ₱100 debt — the
// ₱60 remaining is what is left *after* the ₱40, and the two must be added
// back together. That is exactly what the server does: it re-derives the pair
// with this row excluded, which is the same figure as the current pair plus
// this row's amount.
//
// Adding the signed balance rather than the absolute one is what keeps the odd
// cases right. A payment that fully settled its pair leaves no pair at all, so
// the maximum is the payment itself. A pair that has since reversed — settled,
// then the other person paid for something — contributes a negative, correctly
// lowering the ceiling.
export const editMaximumCentavos = (balances, settlement) => {
    if (!settlement) {
        return 0;
    }

    const own = toCentavos(settlement.amount) ?? 0;
    return directedBalanceCentavos(balances, settlement.fromMember.id, settlement.toMember.id) + own;
};

// Which of the three sentences a direction reads as, from the current user's
// seat. Every label on these screens is chosen by this, so "from" and "to"
// never reach the user as words.
export const directionKind = (fromMemberId, toMemberId, currentUserMemberId) => {
    if (currentUserMemberId && toMemberId === currentUserMemberId) {
        return 'theyPayYou';
    }
    if (currentUserMemberId && fromMemberId === currentUserMemberId) {
        return 'youPay';
    }
    return 'thirdParty';
};

// Sentence builders. Each returns a key and its placeholder values rather than
// a finished string, so the caller translates once and the tests can assert on
// the key without reproducing the English.
const sentence = (kind, keys, { fromName, toName }) => {
    if (kind === 'theyPayYou') {
        return { key: keys.theyPayYou, values: { name: fromName } };
    }
    if (kind === 'youPay') {
        return { key: keys.youPay, values: { name: toName } };
    }
    return { key: keys.thirdParty, values: { nameA: fromName, nameB: toName } };
};

// "John is paying you" — the fixed direction at the top of the record form.
export const directionSentence = (kind, names) =>
    sentence(kind, {
        theyPayYou: 'settle.dirTheyPayYou',
        youPay: 'settle.dirYouPay',
        thirdParty: 'settle.dirOther',
    }, names);

// "John paid you" — the same fact once it has happened, on the edit screen.
export const paidSentence = (kind, names) =>
    sentence(kind, {
        theyPayYou: 'settle.paidYou',
        youPay: 'settle.youPaid',
        thirdParty: 'settle.paidOther',
    }, names);

// "John paid you ₱40.00" — one history row, as one sentence, so a screen
// reader stops on it once and hears the whole thing.
export const rowSentence = (kind, names, amount) => {
    const base = sentence(kind, {
        theyPayYou: 'settle.rowPaidYou',
        youPay: 'settle.rowYouPaid',
        thirdParty: 'settle.rowPaidOther',
    }, names);

    return { key: base.key, values: { ...base.values, amount } };
};

// What the group looks like after this payment lands, in plain language.
//
// `remainingCentavos` is the subtraction the preview already showed, not a
// fresh opinion about the ledger: the confirmation a user reads has to be the
// same number they agreed to a moment earlier.
export const outcomeSentence = (kind, names, remainingCents, formatAmount) => {
    if (remainingCents <= 0) {
        return kind === 'thirdParty'
            ? {
                  key: 'settle.outcomeSettledOther',
                  values: { nameA: names.fromName, nameB: names.toName },
              }
            : {
                  key: 'settle.outcomeSettledYou',
                  values: { name: kind === 'theyPayYou' ? names.fromName : names.toName },
              };
    }

    const amount = formatAmount(toPeso(remainingCents));

    // The debtor is always the payer: whoever is handing money over is the one
    // who owed it, so what is left is still owed the same way round.
    const base = sentence(kind, {
        theyPayYou: 'settle.outcomeOwesYou',
        youPay: 'settle.outcomeYouOwe',
        thirdParty: 'settle.outcomeOwesOther',
    }, names);

    return { key: base.key, values: { ...base.values, amount } };
};

// The preview subtraction, floored at zero. A payment larger than the debt is
// refused by validation rather than shown as a negative remainder — there is no
// such thing as being owed minus one peso.
export const remainingCentavos = (outstandingCents, payingCents) =>
    Math.max(0, outstandingCents - (payingCents ?? 0));

export { toPeso };
