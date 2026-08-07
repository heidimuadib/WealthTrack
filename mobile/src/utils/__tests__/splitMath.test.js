import {
    toCentavos,
    fromCentavos,
    toScaledPercent,
    allocateByWeights,
    splitEqual,
    remainderCount,
    previewEqual,
    previewFixed,
    previewPercentage,
    previewShares,
    buildParticipants,
    methodFromServer,
    MAX_CENTAVOS,
} from '../splitMath';

// The same worked examples the backend's own tests use, so the two cannot
// drift into showing one breakdown and storing another.
const PAUL = 'a-paul';
const JOHN = 'b-john';
const MIKE = 'c-mike';
const ANNE = 'd-anne';
const CARL = 'e-carl';

const sum = (shares) => shares.reduce((running, s) => running + s.amountCentavos, 0);
const amountFor = (shares, memberId) =>
    shares.find((share) => share.memberId === memberId).amountCentavos;

describe('money conversion', () => {
    it('reads what a person types', () => {
        expect(toCentavos('500')).toBe(50000);
        expect(toCentavos('33.34')).toBe(3334);
        expect(toCentavos('0.01')).toBe(1);
        expect(toCentavos('1.5')).toBe(150);
    });

    it('answers null for a half-typed or impossible value rather than throwing', () => {
        // These run on every keystroke; "12." is a state somebody passes
        // through, not an error to report at them.
        ['', '12.', 'abc', '1.005', '₱100', '1,000', null, undefined].forEach((value) =>
            expect(toCentavos(value)).toBeNull()
        );
    });

    it('refuses a value that has already been through floating point', () => {
        expect(toCentavos(0.1 + 0.2)).toBeNull();
    });

    it('writes a decimal string for the request, never a number', () => {
        expect(fromCentavos(50000)).toBe('500.00');
        expect(fromCentavos(3334)).toBe('33.34');
        expect(fromCentavos(0)).toBe('0.00');
        expect(typeof fromCentavos(1)).toBe('string');
    });

    it('round-trips', () => {
        [0, 1, 99, 3333, 50000, MAX_CENTAVOS].forEach((centavos) =>
            expect(toCentavos(fromCentavos(centavos))).toBe(centavos)
        );
    });
});

describe('percentages', () => {
    it('scales to four decimal places', () => {
        expect(toScaledPercent('20')).toBe(200000);
        expect(toScaledPercent('33.3333')).toBe(333333);
        expect(toScaledPercent('100')).toBe(1000000);
    });

    it('answers null for anything unusable', () => {
        ['', '33.33333', '-5', 'half', '101'].forEach((value) =>
            expect(toScaledPercent(value)).toBeNull()
        );
    });
});

describe('allocateByWeights — the rule the backend uses', () => {
    it('splits ₱500 five ways', () => {
        const shares = splitEqual(50000, [PAUL, JOHN, MIKE, ANNE, CARL]);
        shares.forEach((share) => expect(share.amountCentavos).toBe(10000));
        expect(sum(shares)).toBe(50000);
    });

    it('gives the odd centavo of ₱100 among three to the first member by id', () => {
        expect(splitEqual(10000, [MIKE, PAUL, JOHN])).toEqual([
            { memberId: PAUL, amountCentavos: 3334 },
            { memberId: JOHN, amountCentavos: 3333 },
            { memberId: MIKE, amountCentavos: 3333 },
        ]);
    });

    it('ignores the order the participants were selected in', () => {
        expect(splitEqual(10000, [CARL, ANNE, MIKE, JOHN, PAUL])).toEqual(
            splitEqual(10000, [PAUL, JOHN, MIKE, ANNE, CARL])
        );
    });

    it('divides ₱800 by weight 2:1:1', () => {
        const shares = allocateByWeights(80000, [
            { memberId: PAUL, weight: 2 },
            { memberId: JOHN, weight: 1 },
            { memberId: MIKE, weight: 1 },
        ]);

        expect(amountFor(shares, PAUL)).toBe(40000);
        expect(amountFor(shares, JOHN)).toBe(20000);
        expect(amountFor(shares, MIKE)).toBe(20000);
    });

    it('never loses or invents a centavo, across many totals and group sizes', () => {
        const ids = [PAUL, JOHN, MIKE, ANNE, CARL];

        for (let count = 1; count <= 5; count += 1) {
            for (let total = 1; total <= 400; total += 1) {
                const shares = splitEqual(total, ids.slice(0, count));
                expect(sum(shares)).toBe(total);
                const amounts = shares.map((s) => s.amountCentavos);
                expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
            }
        }
    });

    it('stays exact where a double would not', () => {
        const shares = allocateByWeights(MAX_CENTAVOS, [
            { memberId: PAUL, weight: 1000000 },
            { memberId: JOHN, weight: 1 },
        ]);
        expect(sum(shares)).toBe(MAX_CENTAVOS);
    });

    it('answers null rather than guessing on unusable input', () => {
        expect(allocateByWeights(0, [{ memberId: PAUL, weight: 1 }])).toBeNull();
        expect(allocateByWeights(100, [])).toBeNull();
        expect(allocateByWeights(100, [{ memberId: PAUL, weight: 0 }])).toBeNull();
    });

    it('counts how many people carry an extra centavo', () => {
        expect(remainderCount(10000, 3)).toBe(1);
        expect(remainderCount(50000, 5)).toBe(0);
        expect(remainderCount(100, 3)).toBe(1);
        expect(remainderCount(101, 3)).toBe(2);
    });
});

describe('equal preview', () => {
    it('is ready as soon as there is an amount and a participant', () => {
        const preview = previewEqual(50000, [PAUL, JOHN, MIKE, ANNE, CARL]);
        expect(preview.status.kind).toBe('ok');
        expect(preview.extraCentavos).toBe(0);
    });

    it('reports the odd centavos so they can be explained', () => {
        expect(previewEqual(10000, [PAUL, JOHN, MIKE]).extraCentavos).toBe(1);
    });

    it('is not ready without an amount', () => {
        expect(previewEqual(0, [PAUL]).status.kind).toBe('invalid');
    });
});

describe('exact-amounts preview', () => {
    const entries = (...values) =>
        [PAUL, JOHN, MIKE].map((memberId, index) => ({ memberId, value: values[index] }));

    it('is ready only when the figures add to the total exactly', () => {
        const preview = previewFixed(50000, entries('100', '150', '250'));
        expect(preview.status).toEqual({ kind: 'ok' });
        expect(sum(preview.shares)).toBe(50000);
    });

    it('says how much is still to assign', () => {
        expect(previewFixed(50000, entries('100', '150', '')).status).toEqual({
            kind: 'under',
            centavos: 25000,
        });
    });

    it('says how much it is over by', () => {
        expect(previewFixed(50000, entries('300', '300', '')).status).toEqual({
            kind: 'over',
            centavos: 10000,
        });
    });

    it('allows a participant who consumed nothing', () => {
        const preview = previewFixed(50000, entries('500', '0', '0'));
        expect(preview.status.kind).toBe('ok');
        expect(amountFor(preview.shares, JOHN)).toBe(0);
    });

    it('never balances anything by itself', () => {
        // The only two outcomes are the numbers as typed, or a status saying
        // they do not fit.
        const preview = previewFixed(50000, entries('100', '150', '200'));
        expect(amountFor(preview.shares, PAUL)).toBe(10000);
        expect(amountFor(preview.shares, MIKE)).toBe(20000);
        expect(preview.status.kind).toBe('under');
    });

    it('drops a removed participant’s figure entirely', () => {
        const preview = previewFixed(30000, [
            { memberId: PAUL, value: '100' },
            { memberId: JOHN, value: '200' },
        ]);
        expect(preview.shares).toHaveLength(2);
        expect(preview.shares.some((s) => s.memberId === MIKE)).toBe(false);
    });
});

describe('percentage preview', () => {
    const entries = (...values) =>
        [PAUL, JOHN, MIKE].map((memberId, index) => ({ memberId, value: values[index] }));

    it('resolves 50 / 30 / 20 of ₱500', () => {
        const preview = previewPercentage(50000, entries('50', '30', '20'));
        expect(preview.status.kind).toBe('ok');
        expect(amountFor(preview.shares, PAUL)).toBe(25000);
        expect(amountFor(preview.shares, JOHN)).toBe(15000);
        expect(amountFor(preview.shares, MIKE)).toBe(10000);
    });

    it('accepts thirds written to four places', () => {
        const preview = previewPercentage(10000, entries('33.3333', '33.3333', '33.3334'));
        expect(preview.status.kind).toBe('ok');
        expect(sum(preview.shares)).toBe(10000);
    });

    it('refuses 33.33 three times, and says what is missing', () => {
        const preview = previewPercentage(10000, entries('33.33', '33.33', '33.33'));
        expect(preview.status).toEqual({ kind: 'under', scaled: 100 });
    });

    it('refuses more than 100', () => {
        expect(previewPercentage(10000, entries('60', '60', '0')).status.kind).toBe('over');
    });

    it('normalises nothing', () => {
        const preview = previewPercentage(10000, entries('50', '40', '5'));
        expect(preview.status.kind).toBe('under');
        // No resolved figures offered while it does not add up.
        expect(sum(preview.shares)).toBe(0);
    });
});

describe('shares preview', () => {
    const entries = (...values) =>
        [PAUL, JOHN, MIKE].map((memberId, index) => ({ memberId, value: values[index] }));

    it('divides ₱800 by 2:1:1', () => {
        const preview = previewShares(80000, entries('2', '1', '1'));
        expect(preview.status.kind).toBe('ok');
        expect(amountFor(preview.shares, PAUL)).toBe(40000);
        expect(preview.totalWeight).toBe(4);
    });

    it('allows a weight of zero as long as somebody has one', () => {
        const preview = previewShares(80000, entries('2', '0', '2'));
        expect(preview.status.kind).toBe('ok');
        expect(amountFor(preview.shares, JOHN)).toBe(0);
    });

    it('is not ready when every weight is zero', () => {
        expect(previewShares(80000, entries('0', '0', '0')).status.kind).toBe('invalid');
    });

    it('refuses a fractional or negative weight', () => {
        expect(previewShares(80000, entries('1.5', '1', '1')).status.kind).toBe('invalid');
        expect(previewShares(80000, entries('-1', '1', '1')).status.kind).toBe('invalid');
    });

    it('spreads an awkward remainder without losing a centavo', () => {
        expect(sum(previewShares(10000, entries('1', '1', '1')).shares)).toBe(10000);
    });
});

describe('the request body each method sends', () => {
    const entries = [
        { memberId: PAUL, value: '2' },
        { memberId: JOHN, value: '1' },
    ];

    it('sends ids alone for an equal split', () => {
        expect(buildParticipants('equal', entries)).toEqual([
            { memberId: PAUL },
            { memberId: JOHN },
        ]);
    });

    it('sends decimal strings for exact amounts', () => {
        expect(
            buildParticipants('fixed', [
                { memberId: PAUL, value: '100' },
                { memberId: JOHN, value: '0' },
            ])
        ).toEqual([
            { memberId: PAUL, amount: '100.00' },
            { memberId: JOHN, amount: '0.00' },
        ]);
    });

    it('sends the percentage exactly as typed', () => {
        expect(
            buildParticipants('percentage', [{ memberId: PAUL, value: '33.3333' }])
        ).toEqual([{ memberId: PAUL, percentage: '33.3333' }]);
    });

    it('sends whole numbers for shares', () => {
        expect(buildParticipants('shares', entries)).toEqual([
            { memberId: PAUL, shares: 2 },
            { memberId: JOHN, shares: 1 },
        ]);
    });
});

describe('reading a split method back', () => {
    it('maps the enum the API answers with', () => {
        expect(methodFromServer('EQUAL')).toBe('equal');
        // CUSTOM is what the column has been called since the schema shipped;
        // "exact amounts" is what a person calls it.
        expect(methodFromServer('CUSTOM')).toBe('fixed');
        expect(methodFromServer('PERCENTAGE')).toBe('percentage');
        expect(methodFromServer('SHARES')).toBe('shares');
    });

    it('falls back to equal for anything unrecognised', () => {
        expect(methodFromServer(undefined)).toBe('equal');
    });
});
