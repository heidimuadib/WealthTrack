const {
    MAX_CENTAVOS,
    toCentavos,
    fromCentavos,
    toScaledPercent,
    allocateByWeights,
    splitEqual,
    splitByPercentage,
    splitByShares,
    validateCustomSplit,
    calculateMemberBalances,
    calculatePairwiseBalances,
    pairBalanceFor,
} = require('../groupMoney');

// Readable stand-ins for uuids. Sorted order is ME < B < C < D < E only by
// accident of the alphabet, so several cases below deliberately pass them in
// the wrong order to prove the functions do their own sorting.
const ME = 'aaaa-me';
const B = 'bbbb-john';
const C = 'cccc-mark';
const D = 'dddd-anna';
const E = 'eeee-kate';

const peso = (amount) => toCentavos(amount);

const expense = ({ id = 'x', payer, amount, shares }) => ({
    id,
    payerMemberId: payer,
    amountCentavos: amount,
    shares: shares.map(([memberId, amountCentavos]) => ({ memberId, amountCentavos })),
});

const settlement = (from, to, amountCentavos) => ({
    fromMemberId: from,
    toMemberId: to,
    amountCentavos,
});

describe('toCentavos', () => {
    it('converts whole pesos', () => {
        expect(toCentavos(500)).toBe(50000);
        expect(toCentavos('500')).toBe(50000);
    });

    it('converts zero', () => {
        expect(toCentavos(0)).toBe(0);
        expect(toCentavos('0.00')).toBe(0);
    });

    it('converts a single centavo', () => {
        expect(toCentavos('0.01')).toBe(1);
    });

    it('treats one decimal place as tenths, not hundredths', () => {
        expect(toCentavos('1.5')).toBe(150);
    });

    it('reads a Prisma Decimal through its toString', () => {
        const decimal = { toString: () => '1234.56' };
        expect(toCentavos(decimal)).toBe(123456);
    });

    it('refuses a third decimal place rather than rounding it away', () => {
        // ₱1.005 cannot be stored, and picking a direction here would be the
        // app deciding on its own who gets the extra centavo.
        expect(() => toCentavos('1.005')).toThrow(/valid money value/);
        expect(() => toCentavos(1.005)).toThrow(/valid money value/);
    });

    it('refuses a value that has already been through floating point', () => {
        expect(() => toCentavos(0.1 + 0.2)).toThrow(/valid money value/);
    });

    it('refuses nonsense', () => {
        ['', 'abc', '₱100', '1,000', '1e5', '--5', '.', '1.', null, undefined].forEach(
            (value) => {
                expect(() => toCentavos(value)).toThrow();
            }
        );
    });

    it('refuses NaN and both infinities', () => {
        expect(() => toCentavos(NaN)).toThrow(/finite/);
        expect(() => toCentavos(Infinity)).toThrow(/finite/);
        expect(() => toCentavos(-Infinity)).toThrow(/finite/);
    });

    it('accepts the largest storable amount and refuses the next one up', () => {
        expect(toCentavos('9999999999.99')).toBe(MAX_CENTAVOS);
        expect(() => toCentavos('10000000000.00')).toThrow(/storable range/);
    });

    it('refuses a value too large to stay exact', () => {
        expect(() => toCentavos('999999999999999999')).toThrow();
    });

    it('carries a signal a caller can branch on', () => {
        expect.assertions(1);
        try {
            toCentavos('nope');
        } catch (error) {
            expect(error.code).toBe('INVALID_MONEY');
        }
    });
});

describe('fromCentavos', () => {
    it('always writes two decimal places', () => {
        expect(fromCentavos(0)).toBe('0.00');
        expect(fromCentavos(1)).toBe('0.01');
        expect(fromCentavos(50000)).toBe('500.00');
        expect(fromCentavos(3334)).toBe('33.34');
    });

    it('keeps a sign', () => {
        expect(fromCentavos(-10000)).toBe('-100.00');
    });

    it('round-trips every value it is given', () => {
        [0, 1, 99, 100, 3333, 50000, MAX_CENTAVOS].forEach((centavos) => {
            expect(toCentavos(fromCentavos(centavos))).toBe(centavos);
        });
    });

    it('refuses a fractional centavo', () => {
        expect(() => fromCentavos(10.5)).toThrow(/safe integer/);
    });
});

describe('splitEqual', () => {
    it('splits the ₱500 bill five ways', () => {
        const shares = splitEqual(peso(500), [ME, B, C, D, E]);

        expect(shares).toHaveLength(5);
        shares.forEach((share) => expect(share.amountCentavos).toBe(10000));
        expect(shares.reduce((sum, s) => sum + s.amountCentavos, 0)).toBe(50000);
    });

    it('gives the odd centavo of ₱100 among three to the first member by id', () => {
        const shares = splitEqual(peso(100), [C, ME, B]);

        expect(shares).toEqual([
            { memberId: ME, amountCentavos: 3334 },
            { memberId: B, amountCentavos: 3333 },
            { memberId: C, amountCentavos: 3333 },
        ]);
        expect(shares.reduce((sum, s) => sum + s.amountCentavos, 0)).toBe(10000);
    });

    it('splits a single centavo three ways without inventing money', () => {
        const shares = splitEqual(1, [ME, B, C]);

        expect(shares.map((s) => s.amountCentavos)).toEqual([1, 0, 0]);
        expect(shares.reduce((sum, s) => sum + s.amountCentavos, 0)).toBe(1);
    });

    it('gives one participant the whole thing', () => {
        expect(splitEqual(peso(250), [ME])).toEqual([{ memberId: ME, amountCentavos: 25000 }]);
    });

    it('handles twenty participants', () => {
        const ids = Array.from({ length: 20 }, (_, i) => `member-${String(i).padStart(2, '0')}`);
        const shares = splitEqual(peso(100), ids);

        expect(shares).toHaveLength(20);
        expect(shares.reduce((sum, s) => sum + s.amountCentavos, 0)).toBe(10000);
    });

    it('ignores the order the client sent', () => {
        expect(splitEqual(peso(100), [E, D, C, B, ME])).toEqual(
            splitEqual(peso(100), [ME, B, C, D, E])
        );
    });

    it('refuses a duplicate participant', () => {
        expect(() => splitEqual(peso(100), [ME, B, ME])).toThrow(/twice/);
    });

    it('refuses an empty participant list', () => {
        expect(() => splitEqual(peso(100), [])).toThrow(/at least one/i);
    });

    it('refuses a participant with no id', () => {
        expect(() => splitEqual(peso(100), [ME, ''])).toThrow(/id/);
        expect(() => splitEqual(peso(100), [ME, null])).toThrow(/id/);
    });

    it('refuses a total of zero or less', () => {
        expect(() => splitEqual(0, [ME])).toThrow(/greater than zero/);
        expect(() => splitEqual(-100, [ME])).toThrow(/greater than zero/);
    });

    it('refuses a fractional total', () => {
        expect(() => splitEqual(100.5, [ME])).toThrow(/safe integer/);
    });

    it('never loses or invents a centavo, across many totals and group sizes', () => {
        for (let count = 1; count <= 13; count += 1) {
            const ids = Array.from({ length: count }, (_, i) => `m-${String(i).padStart(3, '0')}`);

            for (let total = 1; total <= 400; total += 1) {
                const shares = splitEqual(total, ids);
                const sum = shares.reduce((running, s) => running + s.amountCentavos, 0);

                expect(sum).toBe(total);
                // Nobody may be more than a centavo away from anybody else.
                const amounts = shares.map((s) => s.amountCentavos);
                expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe('allocateByWeights', () => {
    const sum = (shares) => shares.reduce((running, s) => running + s.amountCentavos, 0);

    it('agrees with splitEqual whenever the weights are equal', () => {
        // The two are the same allocation; this pins that they cannot drift.
        for (let count = 1; count <= 9; count += 1) {
            const ids = Array.from({ length: count }, (_, i) => `m-${String(i).padStart(2, '0')}`);
            for (let total = 1; total <= 200; total += 3) {
                const weighted = allocateByWeights(
                    total,
                    ids.map((memberId) => ({ memberId, weight: 1 }))
                );
                expect({ count, total, weighted }).toEqual({
                    count,
                    total,
                    weighted: splitEqual(total, ids),
                });
            }
        }
    });

    it('gives the leftover centavos to whoever was cut the most', () => {
        // 100 centavos, weights 1:1:1 — each exactly 33⅓, so the tie is broken
        // by member id and the first gets the extra.
        expect(allocateByWeights(100, [
            { memberId: 'c', weight: 1 },
            { memberId: 'a', weight: 1 },
            { memberId: 'b', weight: 1 },
        ])).toEqual([
            { memberId: 'a', amountCentavos: 34 },
            { memberId: 'b', amountCentavos: 33 },
            { memberId: 'c', amountCentavos: 33 },
        ]);
    });

    it('never loses a centavo across many weightings', () => {
        const weightSets = [[1, 2], [2, 1, 1], [3, 5, 7], [1, 1, 1, 1, 1, 1, 7], [10, 1]];

        weightSets.forEach((weights) => {
            const entries = weights.map((weight, i) => ({ memberId: `m-${i}`, weight }));
            for (let total = 1; total <= 500; total += 7) {
                expect({ weights, total, sum: sum(allocateByWeights(total, entries)) }).toEqual({
                    weights,
                    total,
                    sum: total,
                });
            }
        });
    });

    it('stays exact at the top of the storable range', () => {
        // total x weight overflows a double here; the allocation is done in
        // BigInt for exactly this reason.
        const shares = allocateByWeights(MAX_CENTAVOS, [
            { memberId: 'a', weight: 1000000 },
            { memberId: 'b', weight: 1 },
        ]);
        expect(sum(shares)).toBe(MAX_CENTAVOS);
    });

    it('allows a weight of zero but not a set that is all zero', () => {
        expect(
            allocateByWeights(100, [
                { memberId: 'a', weight: 1 },
                { memberId: 'b', weight: 0 },
            ])
        ).toEqual([
            { memberId: 'a', amountCentavos: 100 },
            { memberId: 'b', amountCentavos: 0 },
        ]);

        expect(() =>
            allocateByWeights(100, [
                { memberId: 'a', weight: 0 },
                { memberId: 'b', weight: 0 },
            ])
        ).toThrow(/greater than zero/);
    });

    it('refuses duplicates, negatives and fractions', () => {
        expect(() =>
            allocateByWeights(100, [
                { memberId: 'a', weight: 1 },
                { memberId: 'a', weight: 1 },
            ])
        ).toThrow(/twice/);
        expect(() => allocateByWeights(100, [{ memberId: 'a', weight: -1 }])).toThrow(/zero or more/);
        expect(() => allocateByWeights(100, [{ memberId: 'a', weight: 1.5 }])).toThrow(/zero or more/);
    });
});

describe('toScaledPercent', () => {
    it('scales to four decimal places', () => {
        expect(toScaledPercent('20')).toBe(200000);
        expect(toScaledPercent('33.3333')).toBe(333333);
        expect(toScaledPercent(100)).toBe(1000000);
        expect(toScaledPercent('0')).toBe(0);
    });

    it('refuses more than four decimals, negatives and rubbish', () => {
        ['33.33333', '-5', 'half', '', '1e2', null].forEach((value) => {
            expect(() => toScaledPercent(value)).toThrow();
        });
    });

    it('refuses more than 100%', () => {
        expect(() => toScaledPercent('101')).toThrow(/allowed range/);
    });
});

describe('splitByPercentage', () => {
    it('applies 20 / 30 / 50 to ₱500', () => {
        const shares = splitByPercentage(50000, [
            { memberId: 'b', percentage: '20' },
            { memberId: 'a', percentage: '50' },
            { memberId: 'c', percentage: '30' },
        ]);

        expect(shares).toEqual([
            { memberId: 'a', amountCentavos: 25000, splitInput: '50' },
            { memberId: 'b', amountCentavos: 10000, splitInput: '20' },
            { memberId: 'c', amountCentavos: 15000, splitInput: '30' },
        ]);
    });

    it('adds to the total even when the percentages are thirds', () => {
        const shares = splitByPercentage(10000, [
            { memberId: 'a', percentage: '33.3333' },
            { memberId: 'b', percentage: '33.3333' },
            { memberId: 'c', percentage: '33.3334' },
        ]);
        expect(shares.reduce((sum, s) => sum + s.amountCentavos, 0)).toBe(10000);
    });

    it('refuses anything that is not exactly 100', () => {
        expect(() =>
            splitByPercentage(10000, [
                { memberId: 'a', percentage: '50' },
                { memberId: 'b', percentage: '49.9999' },
            ])
        ).toThrow(/99.9999%.*100%/);
    });
});

describe('splitByShares', () => {
    it('divides ₱800 by 2:1:1', () => {
        const shares = splitByShares(80000, [
            { memberId: 'paul', shares: 2 },
            { memberId: 'john', shares: 1 },
            { memberId: 'mike', shares: 1 },
        ]);

        expect(shares).toEqual([
            { memberId: 'john', amountCentavos: 20000, splitInput: '1' },
            { memberId: 'mike', amountCentavos: 20000, splitInput: '1' },
            { memberId: 'paul', amountCentavos: 40000, splitInput: '2' },
        ]);
    });

    it('refuses a fractional weight', () => {
        expect(() => splitByShares(1000, [{ memberId: 'a', shares: 1.5 }])).toThrow(/whole number/);
    });
});

describe('validateCustomSplit', () => {
    it('accepts a split that adds up', () => {
        const shares = validateCustomSplit(peso(500), [
            { memberId: ME, amountCentavos: peso(200) },
            { memberId: B, amountCentavos: peso(300) },
        ]);

        expect(shares).toEqual([
            { memberId: ME, amountCentavos: 20000 },
            { memberId: B, amountCentavos: 30000 },
        ]);
    });

    it('allows a zero share, because being there is worth recording', () => {
        const shares = validateCustomSplit(peso(500), [
            { memberId: ME, amountCentavos: peso(500) },
            { memberId: B, amountCentavos: 0 },
        ]);

        expect(shares.find((s) => s.memberId === B).amountCentavos).toBe(0);
    });

    it('returns a deterministic order regardless of input order', () => {
        const input = [
            { memberId: C, amountCentavos: peso(100) },
            { memberId: ME, amountCentavos: peso(100) },
            { memberId: B, amountCentavos: peso(100) },
        ];

        expect(validateCustomSplit(peso(300), input).map((s) => s.memberId)).toEqual([ME, B, C]);
    });

    it('refuses a split that is short, and says by how much', () => {
        expect(() =>
            validateCustomSplit(peso(500), [
                { memberId: ME, amountCentavos: peso(200) },
                { memberId: B, amountCentavos: peso(295) },
            ])
        ).toThrow(/495\.00.*500\.00/);
    });

    it('refuses a split that is over', () => {
        expect(() =>
            validateCustomSplit(peso(500), [
                { memberId: ME, amountCentavos: peso(300) },
                { memberId: B, amountCentavos: peso(300) },
            ])
        ).toThrow(/600\.00.*500\.00/);
    });

    it('refuses a negative share', () => {
        expect(() =>
            validateCustomSplit(peso(100), [
                { memberId: ME, amountCentavos: peso(200) },
                { memberId: B, amountCentavos: -peso(100) },
            ])
        ).toThrow(/negative/);
    });

    it('refuses a duplicated member', () => {
        expect(() =>
            validateCustomSplit(peso(200), [
                { memberId: ME, amountCentavos: peso(100) },
                { memberId: ME, amountCentavos: peso(100) },
            ])
        ).toThrow(/twice/);
    });

    it('refuses an empty list', () => {
        expect(() => validateCustomSplit(peso(100), [])).toThrow(/at least one/i);
    });

    it('refuses a fractional or unsafe share', () => {
        expect(() =>
            validateCustomSplit(peso(100), [{ memberId: ME, amountCentavos: 10000.5 }])
        ).toThrow(/safe integer/);
        expect(() =>
            validateCustomSplit(peso(100), [{ memberId: ME, amountCentavos: Number.MAX_VALUE }])
        ).toThrow(/safe integer/);
    });

    it('never quietly adjusts anything', () => {
        // The only two outcomes are the exact input back, or a throw.
        const exact = [
            { memberId: ME, amountCentavos: 3334 },
            { memberId: B, amountCentavos: 3333 },
            { memberId: C, amountCentavos: 3333 },
        ];
        expect(validateCustomSplit(10000, exact)).toEqual(exact);
    });
});

describe('calculateMemberBalances', () => {
    // The situation the whole feature exists for: I pay ₱500, five of us split
    // it evenly, so I am out ₱400 and each of the other four owes me ₱100.
    const theBoholBill = expense({
        id: 'bill',
        payer: ME,
        amount: peso(500),
        shares: [
            [ME, peso(100)],
            [B, peso(100)],
            [C, peso(100)],
            [D, peso(100)],
            [E, peso(100)],
        ],
    });

    it('leaves me ₱400 up and everybody else ₱100 down', () => {
        const balances = calculateMemberBalances([theBoholBill], []);
        const net = (id) => balances.find((b) => b.memberId === id).netCentavos;

        expect(net(ME)).toBe(peso(400));
        [B, C, D, E].forEach((id) => expect(net(id)).toBe(-peso(100)));
    });

    it('reports what was paid and what was consumed separately', () => {
        const mine = calculateMemberBalances([theBoholBill], []).find((b) => b.memberId === ME);

        expect(mine.paidCentavos).toBe(peso(500));
        expect(mine.owedCentavos).toBe(peso(100));
    });

    it('handles somebody else paying', () => {
        const bill = expense({
            payer: B,
            amount: peso(300),
            shares: [
                [ME, peso(150)],
                [B, peso(150)],
            ],
        });
        const balances = calculateMemberBalances([bill], []);

        expect(balances.find((b) => b.memberId === ME).netCentavos).toBe(-peso(150));
        expect(balances.find((b) => b.memberId === B).netCentavos).toBe(peso(150));
    });

    it('handles paying for others without taking part', () => {
        const bill = expense({
            payer: ME,
            amount: peso(200),
            shares: [
                [B, peso(100)],
                [C, peso(100)],
            ],
        });
        const balances = calculateMemberBalances([bill], []);

        expect(balances.find((b) => b.memberId === ME).netCentavos).toBe(peso(200));
        expect(balances.find((b) => b.memberId === ME).owedCentavos).toBe(0);
    });

    it('settles a one-person expense to zero', () => {
        const bill = expense({ payer: ME, amount: peso(80), shares: [[ME, peso(80)]] });
        expect(calculateMemberBalances([bill], [])).toEqual([
            expect.objectContaining({ memberId: ME, netCentavos: 0 }),
        ]);
    });

    it('adds several expenses together', () => {
        const first = expense({
            id: '1',
            payer: ME,
            amount: peso(500),
            shares: [
                [ME, peso(250)],
                [B, peso(250)],
            ],
        });
        const second = expense({
            id: '2',
            payer: B,
            amount: peso(100),
            shares: [
                [ME, peso(50)],
                [B, peso(50)],
            ],
        });
        const balances = calculateMemberBalances([first, second], []);

        expect(balances.find((b) => b.memberId === ME).netCentavos).toBe(peso(200));
        expect(balances.find((b) => b.memberId === B).netCentavos).toBe(-peso(200));
    });

    it('reduces the balance on a partial settlement', () => {
        const balances = calculateMemberBalances(
            [theBoholBill],
            [settlement(E, ME, peso(40))]
        );

        expect(balances.find((b) => b.memberId === ME).netCentavos).toBe(peso(360));
        expect(balances.find((b) => b.memberId === E).netCentavos).toBe(-peso(60));
    });

    it('clears the balance on a full settlement', () => {
        const balances = calculateMemberBalances(
            [theBoholBill],
            [
                settlement(B, ME, peso(100)),
                settlement(C, ME, peso(100)),
                settlement(D, ME, peso(100)),
                settlement(E, ME, peso(100)),
            ]
        );

        balances.forEach((balance) => expect(balance.netCentavos).toBe(0));
    });

    it('handles a settlement sent the other way', () => {
        const balances = calculateMemberBalances([theBoholBill], [settlement(ME, B, peso(50))]);

        expect(balances.find((b) => b.memberId === ME).netCentavos).toBe(peso(450));
        expect(balances.find((b) => b.memberId === B).netCentavos).toBe(-peso(150));
    });

    it('refuses a bill whose shares do not add up to it', () => {
        const broken = expense({
            id: 'broken',
            payer: ME,
            amount: peso(500),
            shares: [
                [ME, peso(100)],
                [B, peso(100)],
            ],
        });

        expect(() => calculateMemberBalances([broken], [])).toThrow(/200\.00.*500\.00/);
    });

    it('refuses a settlement to oneself, and a non-positive one', () => {
        expect(() =>
            calculateMemberBalances([theBoholBill], [settlement(ME, ME, peso(10))])
        ).toThrow(/themselves/);
        expect(() => calculateMemberBalances([theBoholBill], [settlement(B, ME, 0)])).toThrow(
            /positive/
        );
        expect(() =>
            calculateMemberBalances([theBoholBill], [settlement(B, ME, -peso(10))])
        ).toThrow(/positive/);
    });

    it('always cancels to zero, across many generated groups', () => {
        for (let count = 1; count <= 8; count += 1) {
            const ids = Array.from({ length: count }, (_, i) => `g-${String(i).padStart(2, '0')}`);

            for (let total = 1; total <= 200; total += 7) {
                const shares = splitEqual(total, ids);
                const bill = {
                    id: `t${total}`,
                    payerMemberId: ids[total % count],
                    amountCentavos: total,
                    shares,
                };
                const settlements =
                    count > 1
                        ? [settlement(ids[0], ids[count - 1], Math.max(1, Math.floor(total / 3)))]
                        : [];

                const balances = calculateMemberBalances([bill], settlements);
                const sum = balances.reduce((running, b) => running + b.netCentavos, 0);

                expect(sum).toBe(0);
            }
        }
    });
});

describe('calculatePairwiseBalances', () => {
    const theBoholBill = expense({
        id: 'bill',
        payer: ME,
        amount: peso(500),
        shares: [
            [ME, peso(100)],
            [B, peso(100)],
            [C, peso(100)],
            [D, peso(100)],
            [E, peso(100)],
        ],
    });

    it('says each of the four owes me ₱100', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], []);

        expect(pairs).toHaveLength(4);
        [B, C, D, E].forEach((id) => {
            expect(pairBalanceFor(pairs, id, ME)).toBe(peso(100));
            expect(pairBalanceFor(pairs, ME, id)).toBe(-peso(100));
        });
    });

    it('never lists the payer as owing themselves', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], []);
        expect(pairs.some((p) => p.memberAId === p.memberBId)).toBe(false);
        expect(pairBalanceFor(pairs, ME, ME)).toBe(0);
    });

    it('stores each pair once, in canonical order', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], []);
        const keys = pairs.map((p) => `${p.memberAId}|${p.memberBId}`);

        expect(new Set(keys).size).toBe(keys.length);
        pairs.forEach((pair) => expect(pair.memberAId < pair.memberBId).toBe(true));
    });

    it('nets two people who each paid for the other', () => {
        const mine = expense({
            id: '1',
            payer: ME,
            amount: peso(300),
            shares: [
                [ME, peso(150)],
                [B, peso(150)],
            ],
        });
        const theirs = expense({
            id: '2',
            payer: B,
            amount: peso(100),
            shares: [
                [ME, peso(50)],
                [B, peso(50)],
            ],
        });

        // B owes me 150, I owe B 50 — one line, not two.
        const pairs = calculatePairwiseBalances([mine, theirs], []);
        expect(pairs).toHaveLength(1);
        expect(pairBalanceFor(pairs, B, ME)).toBe(peso(100));
    });

    it('reduces a pair on a partial settlement', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], [settlement(E, ME, peso(40))]);
        expect(pairBalanceFor(pairs, E, ME)).toBe(peso(60));
    });

    it('drops a pair entirely once it is settled', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], [settlement(E, ME, peso(100))]);

        expect(pairs).toHaveLength(3);
        expect(pairBalanceFor(pairs, E, ME)).toBe(0);
    });

    it('flips the sign when somebody overpays', () => {
        const pairs = calculatePairwiseBalances([theBoholBill], [settlement(E, ME, peso(150))]);
        expect(pairBalanceFor(pairs, E, ME)).toBe(-peso(50));
        expect(pairBalanceFor(pairs, ME, E)).toBe(peso(50));
    });

    it('refuses a bill whose shares do not add up', () => {
        const broken = expense({
            id: 'broken',
            payer: ME,
            amount: peso(100),
            shares: [[B, peso(40)]],
        });
        expect(() => calculatePairwiseBalances([broken], [])).toThrow();
    });

    it("agrees with each member's overall net, across generated groups", () => {
        // The invariant tying the two views together: everything one member
        // owes the others, added up, is exactly the opposite of their net.
        for (let count = 2; count <= 6; count += 1) {
            const ids = Array.from({ length: count }, (_, i) => `p-${String(i).padStart(2, '0')}`);

            for (let total = 3; total <= 150; total += 11) {
                const expenses = ids.map((payer, index) => ({
                    id: `${payer}-${total}`,
                    payerMemberId: payer,
                    amountCentavos: total + index,
                    shares: splitEqual(total + index, ids),
                }));
                // The second settlement only exists once there are three
                // members — with two, ids[1] and ids[count - 1] are the same
                // person, and paying yourself is refused for good reason.
                const settlements = [
                    settlement(ids[0], ids[1], Math.max(1, Math.floor(total / 4))),
                    ...(count > 2
                        ? [settlement(ids[1], ids[count - 1], Math.max(1, Math.floor(total / 5)))]
                        : []),
                ];

                const balances = calculateMemberBalances(expenses, settlements);
                const pairs = calculatePairwiseBalances(expenses, settlements);

                ids.forEach((id) => {
                    const outgoing = ids
                        .filter((other) => other !== id)
                        .reduce((running, other) => running + pairBalanceFor(pairs, id, other), 0);
                    const net = balances.find((b) => b.memberId === id).netCentavos;

                    // Stated as a sum rather than `outgoing === -net` because
                    // Object.is separates 0 from -0, and a settled member
                    // produces one of each.
                    expect(outgoing + net).toBe(0);
                });
            }
        }
    });
});
