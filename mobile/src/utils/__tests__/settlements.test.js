import {
    directedBalanceCentavos,
    directionKind,
    directionSentence,
    editMaximumCentavos,
    findPair,
    outcomeSentence,
    paidSentence,
    recordMaximumCentavos,
    remainingCentavos,
    rowSentence,
} from '../settlements';

const PAUL = 'm-self';
const JOHN = 'm-john';
const MIKE = 'm-mike';

// Shaped as groupBalanceView() serialises a pair: ids stored in canonical
// order, a magnitude that is always positive, and the direction said out loud
// beside it.
const pair = (aId, bId, balance, fromId, toId) => ({
    memberAId: aId,
    memberAName: aId,
    memberBId: bId,
    memberBName: bId,
    balance,
    direction: { fromMemberId: fromId, toMemberId: toId },
});

const view = (pairs, currentUserMemberId = PAUL) => ({ currentUserMemberId, pairs });

const settlement = (amount, fromId = JOHN, toId = PAUL) => ({
    id: 's-1',
    amount,
    fromMember: { id: fromId, name: fromId },
    toMember: { id: toId, name: toId },
});

describe('finding the pair', () => {
    it('matches whichever way round the caller asks', () => {
        const balances = view([pair(JOHN, PAUL, 100, JOHN, PAUL)]);

        expect(findPair(balances, JOHN, PAUL)).not.toBeNull();
        expect(findPair(balances, PAUL, JOHN)).not.toBeNull();
    });

    it('is null when the two have no balance between them', () => {
        expect(findPair(view([pair(JOHN, PAUL, 100, JOHN, PAUL)]), MIKE, PAUL)).toBeNull();
        expect(findPair(view([]), JOHN, PAUL)).toBeNull();
        expect(findPair(undefined, JOHN, PAUL)).toBeNull();
    });
});

describe('directed balance', () => {
    it('is positive in the direction the debt actually runs', () => {
        const balances = view([pair(JOHN, PAUL, 100, JOHN, PAUL)]);
        expect(directedBalanceCentavos(balances, JOHN, PAUL)).toBe(10000);
    });

    // The sign is what makes the edit ceiling below fall out without cases.
    it('is negative when asked about the opposite direction', () => {
        const balances = view([pair(JOHN, PAUL, 100, JOHN, PAUL)]);
        expect(directedBalanceCentavos(balances, PAUL, JOHN)).toBe(-10000);
    });

    it('is zero when there is no pair at all', () => {
        expect(directedBalanceCentavos(view([]), JOHN, PAUL)).toBe(0);
    });

    it('reads centavos exactly rather than through a float', () => {
        const balances = view([pair(JOHN, PAUL, 0.3, JOHN, PAUL)]);
        expect(directedBalanceCentavos(balances, JOHN, PAUL)).toBe(30);
    });
});

describe('the maximum a new payment may be', () => {
    it('is what is currently owed in that direction', () => {
        const balances = view([pair(JOHN, PAUL, 100, JOHN, PAUL)]);
        expect(recordMaximumCentavos(balances, JOHN, PAUL)).toBe(10000);
    });

    it('is zero or less when nothing is owed that way, which closes the form', () => {
        expect(recordMaximumCentavos(view([]), JOHN, PAUL)).toBe(0);
        expect(
            recordMaximumCentavos(view([pair(JOHN, PAUL, 100, JOHN, PAUL)]), PAUL, JOHN)
        ).toBeLessThan(0);
    });
});

// The subtle one, and the reason this file exists.
describe('the maximum an existing payment may be raised to', () => {
    // ₱100 owed, ₱40 already paid, ₱60 showing. Limiting the edit to the ₱60
    // on screen would refuse to correct the ₱40 upwards to what was really
    // handed over.
    it('adds the payment back to what is left, so ₱40 may become ₱100', () => {
        const balances = view([pair(JOHN, PAUL, 60, JOHN, PAUL)]);
        expect(editMaximumCentavos(balances, settlement(40))).toBe(10000);
    });

    it('allows every figure between the remainder and the original debt', () => {
        const balances = view([pair(JOHN, PAUL, 60, JOHN, PAUL)]);
        const maximum = editMaximumCentavos(balances, settlement(40));

        [6000, 8000, 10000].forEach((candidate) => expect(candidate).toBeLessThanOrEqual(maximum));
        expect(10001).toBeGreaterThan(maximum);
    });

    // A payment that cleared its debt leaves no pair behind, and the ceiling is
    // then the payment itself — it can be lowered, but not raised past what was
    // owed before it landed.
    it('is the payment itself when it settled the pair completely', () => {
        expect(editMaximumCentavos(view([]), settlement(100))).toBe(10000);
    });

    // Settled, then the other person paid for something. The pair now points
    // the other way and correctly lowers the ceiling.
    it('subtracts a pair that has since reversed', () => {
        const balances = view([pair(JOHN, PAUL, 50, PAUL, JOHN)]);
        expect(editMaximumCentavos(balances, settlement(100))).toBe(5000);
    });

    it('is zero without a settlement to measure', () => {
        expect(editMaximumCentavos(view([]), null)).toBe(0);
    });
});

describe('what is left afterwards', () => {
    it('subtracts in centavos rather than pesos', () => {
        // 0.3 - 0.1 is 0.19999999999999998 in floating point.
        expect(remainingCentavos(30, 10)).toBe(20);
    });

    it('never goes below zero', () => {
        expect(remainingCentavos(1000, 5000)).toBe(0);
    });

    it('treats a missing amount as nothing paid yet', () => {
        expect(remainingCentavos(1000, null)).toBe(1000);
    });
});

describe('who is paying whom', () => {
    it('recognises money coming to the reader', () => {
        expect(directionKind(JOHN, PAUL, PAUL)).toBe('theyPayYou');
    });

    it('recognises money the reader is handing over', () => {
        expect(directionKind(PAUL, MIKE, PAUL)).toBe('youPay');
    });

    it('recognises two other people settling between themselves', () => {
        expect(directionKind(JOHN, MIKE, PAUL)).toBe('thirdParty');
    });

    // A group the reader is not a member of has no "you" to speak of.
    it('falls back to third-party wording without a current member', () => {
        expect(directionKind(JOHN, MIKE, null)).toBe('thirdParty');
    });
});

describe('sentences', () => {
    const names = { fromName: 'John', toName: 'Paul' };

    it('names only the other person when the reader is one side', () => {
        expect(directionSentence('theyPayYou', names)).toEqual({
            key: 'settle.dirTheyPayYou',
            values: { name: 'John' },
        });
        expect(directionSentence('youPay', names)).toEqual({
            key: 'settle.dirYouPay',
            values: { name: 'Paul' },
        });
    });

    it('names both when neither side is the reader', () => {
        expect(directionSentence('thirdParty', names)).toEqual({
            key: 'settle.dirOther',
            values: { nameA: 'John', nameB: 'Paul' },
        });
    });

    it('puts a payment in the past tense once it has happened', () => {
        expect(paidSentence('theyPayYou', names).key).toBe('settle.paidYou');
        expect(paidSentence('youPay', names).key).toBe('settle.youPaid');
        expect(paidSentence('thirdParty', names).key).toBe('settle.paidOther');
    });

    it('folds the amount into the history row rather than leaving it loose', () => {
        expect(rowSentence('theyPayYou', names, '₱40.00')).toEqual({
            key: 'settle.rowPaidYou',
            values: { name: 'John', amount: '₱40.00' },
        });
    });
});

describe('what the group looks like afterwards', () => {
    const names = { fromName: 'John', toName: 'Paul' };
    const format = (peso) => `₱${peso.toFixed(2)}`;

    it('says what is still owed after a partial payment', () => {
        expect(outcomeSentence('theyPayYou', names, 6000, format)).toEqual({
            key: 'settle.outcomeOwesYou',
            values: { name: 'John', amount: '₱60.00' },
        });
    });

    // The payer is always the debtor, so what is left runs the same way round.
    it('keeps the direction when the reader is the one paying', () => {
        expect(outcomeSentence('youPay', names, 6000, format)).toEqual({
            key: 'settle.outcomeYouOwe',
            values: { name: 'Paul', amount: '₱60.00' },
        });
    });

    it('names both people for a third-party payment', () => {
        expect(outcomeSentence('thirdParty', names, 6000, format)).toEqual({
            key: 'settle.outcomeOwesOther',
            values: { nameA: 'John', nameB: 'Paul', amount: '₱60.00' },
        });
    });

    it('says settled rather than ₱0.00 when nothing is left', () => {
        expect(outcomeSentence('theyPayYou', names, 0, format)).toEqual({
            key: 'settle.outcomeSettledYou',
            values: { name: 'John' },
        });
        expect(outcomeSentence('thirdParty', names, 0, format)).toEqual({
            key: 'settle.outcomeSettledOther',
            values: { nameA: 'John', nameB: 'Paul' },
        });
    });

    it('never reports a negative remainder', () => {
        expect(outcomeSentence('theyPayYou', names, -500, format).key).toBe(
            'settle.outcomeSettledYou'
        );
    });
});
