jest.mock('../../lib/prisma', () => require('../../../test/fakePrisma').createFakePrisma());

const prisma = require('../../lib/prisma');
const groups = require('../group.controller');
const members = require('../groupMember.controller');
const expenses = require('../sharedExpense.controller');

const PAUL = 1;
const STRANGER = 2;
const UUID_A = '11111111-2222-3333-4444-555555555555';

const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
    });
    res.json = jest.fn((body) => {
        res.body = body;
        return res;
    });
    return res;
};

const call = async (handler, { user = PAUL, params = {}, body = {}, query = {} } = {}) => {
    const res = mockRes();
    await handler({ user: { id: user }, params, body, query }, res);
    return res;
};

// The trip from the brief: Paul, John, Mike, Anne, Carl.
let trip;
let food;
let named;

const setUpTrip = async (user = PAUL) => {
    const created = await call(groups.createGroup, { user, body: { name: `Cebu ${user}` } });
    const group = created.body;

    for (const name of ['John', 'Mike', 'Anne', 'Carl']) {
        await call(members.addMember, {
            user,
            params: { groupId: group.id },
            body: { name },
        });
    }

    const detail = await call(groups.getGroup, { user, params: { groupId: group.id } });
    const byName = Object.fromEntries(detail.body.members.map((m) => [m.name, m.id]));
    // The self-member is named from the profile.
    byName.Paul = detail.body.members.find((m) => m.isCurrentUser).id;

    return { group: detail.body, byName };
};

const post = (body, { user = PAUL, groupId = trip.group.id } = {}) =>
    call(expenses.createExpense, { user, params: { groupId }, body });

const restaurant = (overrides = {}) => ({
    description: 'Restaurant',
    amount: '500',
    categoryId: food,
    payerMemberId: named.Paul,
    splitMethod: 'equal',
    participants: [
        { memberId: named.Paul },
        { memberId: named.John },
        { memberId: named.Mike },
        { memberId: named.Anne },
        { memberId: named.Carl },
    ],
    ...overrides,
});

const shareFor = (body, memberId) => body.shares.find((s) => s.memberId === memberId);

// Summed in centavos, never in pesos. The API answers in JSON numbers, and
// adding 333.33 three times in floating point is the very drift the engine
// works in integers to avoid — a test that did it would fail on correct output.
const sumCentavos = (body) =>
    body.shares.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
const inCentavos = (amount) => Math.round(Number(amount) * 100);
const mirrors = () => prisma.__db.expense;

let errorSpy;

beforeEach(async () => {
    Object.keys(prisma.__db).forEach((model) => {
        prisma.__db[model].length = 0;
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    prisma.__seedUser(PAUL, 'Paul');
    prisma.__seedUser(STRANGER, 'Stranger');
    food = prisma.__db.category.push({ id: 7, userId: PAUL, name: 'Food' }) && 7;
    prisma.__db.category.push({ id: 99, userId: STRANGER, name: 'Theirs' });

    trip = await setUpTrip(PAUL);
    named = trip.byName;
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('the brief: ₱500 restaurant, five people, equal', () => {
    it('stores the bill and five shares of ₱100', async () => {
        const res = await post(restaurant());

        expect(res.statusCode).toBe(201);
        expect(res.body.description).toBe('Restaurant');
        expect(res.body.amount).toBe(500);
        expect(res.body.payerMemberId).toBe(named.Paul);
        expect(res.body.splitMethod).toBe('EQUAL');
        expect(res.body.shares).toHaveLength(5);
        res.body.shares.forEach((share) => expect(share.amount).toBe(100));
        expect(sumCentavos(res.body)).toBe(50000);
    });

    it('says nothing about who owes whom', async () => {
        const res = await post(restaurant());

        // Balances are Phase 4. A bill records what was spent; the debt that
        // follows is a separate question answered from these rows.
        ['balance', 'balances', 'owes', 'netBalance', 'settlements'].forEach((key) =>
            expect(res.body).not.toHaveProperty(key)
        );
    });
});

describe('split — equal', () => {
    it('splits 1000 units among three as 334 / 333 / 333', async () => {
        // The brief's example, in the unit the engine actually works in.
        // ₱10.00 is 1000 centavos; a third of it is 334, 333, 333.
        const res = await post(
            restaurant({
                amount: '10',
                participants: [
                    { memberId: named.Paul },
                    { memberId: named.John },
                    { memberId: named.Mike },
                ],
            })
        );

        expect(
            res.body.shares.map((s) => Math.round(s.amount * 100)).sort((a, b) => b - a)
        ).toEqual([334, 333, 333]);
        expect(sumCentavos(res.body)).toBe(1000);
    });

    it('splits ₱1000 among three to the centavo', async () => {
        const res = await post(
            restaurant({
                amount: '1000',
                participants: [
                    { memberId: named.Paul },
                    { memberId: named.John },
                    { memberId: named.Mike },
                ],
            })
        );

        expect(res.body.shares.map((s) => s.amount).sort((a, b) => b - a)).toEqual([
            333.34, 333.33, 333.33,
        ]);
        expect(sumCentavos(res.body)).toBe(100000);
    });

    it('leaves a difference of exactly zero across many totals and sizes', async () => {
        const everyone = [named.Paul, named.John, named.Mike, named.Anne, named.Carl];

        for (let size = 1; size <= 5; size += 1) {
            for (const amount of ['0.01', '0.07', '10', '33.33', '100', '999.99']) {
                const res = await post(
                    restaurant({
                        amount,
                        participants: everyone.slice(0, size).map((memberId) => ({ memberId })),
                    })
                );
                expect({ size, amount, sum: sumCentavos(res.body) }).toEqual({
                    size,
                    amount,
                    sum: inCentavos(amount),
                });
            }
        }
    });

    it('records no split input, because equal has none', async () => {
        const res = await post(restaurant());
        res.body.shares.forEach((share) => expect(share.splitInput).toBeNull());
    });
});

describe('split — fixed amount', () => {
    const fixed = (amounts) =>
        restaurant({
            amount: '500',
            splitMethod: 'fixed',
            participants: amounts,
        });

    it('stores exactly what was typed', async () => {
        const res = await post(
            fixed([
                { memberId: named.John, amount: '150' },
                { memberId: named.Mike, amount: '250' },
                { memberId: named.Paul, amount: '100' },
            ])
        );

        expect(res.statusCode).toBe(201);
        expect(res.body.splitMethod).toBe('CUSTOM');
        expect(shareFor(res.body, named.John).amount).toBe(150);
        expect(shareFor(res.body, named.Mike).amount).toBe(250);
        expect(shareFor(res.body, named.Paul).amount).toBe(100);
    });

    it('refuses a split that is short or over, and names both figures', async () => {
        const short = await post(
            fixed([
                { memberId: named.John, amount: '150' },
                { memberId: named.Paul, amount: '200' },
            ])
        );
        expect(short.statusCode).toBe(400);
        expect(short.body.code).toBe('INVALID_SPLIT');
        expect(short.body.error).toMatch(/350\.00.*500\.00/);

        const over = await post(
            fixed([
                { memberId: named.John, amount: '400' },
                { memberId: named.Paul, amount: '400' },
            ])
        );
        expect(over.statusCode).toBe(400);
    });

    it('accepts a participant who consumed nothing', async () => {
        const res = await post(
            fixed([
                { memberId: named.Paul, amount: '500' },
                { memberId: named.John, amount: '0' },
            ])
        );

        expect(res.statusCode).toBe(201);
        expect(shareFor(res.body, named.John).amount).toBe(0);
    });
});

describe('split — percentage', () => {
    const percentage = (entries, amount = '500') =>
        restaurant({ amount, splitMethod: 'percentage', participants: entries });

    it('applies 20 / 30 / 50', async () => {
        const res = await post(
            percentage([
                { memberId: named.John, percentage: '20' },
                { memberId: named.Mike, percentage: '30' },
                { memberId: named.Paul, percentage: '50' },
            ])
        );

        expect(res.body.splitMethod).toBe('PERCENTAGE');
        expect(shareFor(res.body, named.John).amount).toBe(100);
        expect(shareFor(res.body, named.Mike).amount).toBe(150);
        expect(shareFor(res.body, named.Paul).amount).toBe(250);
        expect(sumCentavos(res.body)).toBe(50000);
    });

    it('remembers the percentages, so the split can be reopened', async () => {
        const res = await post(
            percentage([
                { memberId: named.John, percentage: '20' },
                { memberId: named.Paul, percentage: '80' },
            ])
        );

        // Resolved amounts alone could not be turned back into 20/80.
        expect(shareFor(res.body, named.John).splitInput).toBe('20');
        expect(shareFor(res.body, named.Paul).splitInput).toBe('80');
    });

    it('handles thirds to four decimal places without losing a centavo', async () => {
        const res = await post(
            percentage(
                [
                    { memberId: named.Paul, percentage: '33.3333' },
                    { memberId: named.John, percentage: '33.3333' },
                    { memberId: named.Mike, percentage: '33.3334' },
                ],
                '100'
            )
        );

        expect(sumCentavos(res.body)).toBe(10000);
    });

    it('refuses anything that is not exactly 100%', async () => {
        for (const bad of [
            [
                { memberId: named.John, percentage: '20' },
                { memberId: named.Paul, percentage: '30' },
            ],
            [
                { memberId: named.John, percentage: '60' },
                { memberId: named.Paul, percentage: '60' },
            ],
            [
                { memberId: named.John, percentage: '33.33' },
                { memberId: named.Mike, percentage: '33.33' },
                { memberId: named.Paul, percentage: '33.33' },
            ],
        ]) {
            const res = await post(percentage(bad));
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/100%/);
        }
    });

    it('refuses a percentage that is not a number', async () => {
        const res = await post(
            percentage([
                { memberId: named.John, percentage: 'half' },
                { memberId: named.Paul, percentage: '50' },
            ])
        );
        expect(res.statusCode).toBe(400);
    });
});

describe('split — custom shares', () => {
    const shares = (entries, amount = '800') =>
        restaurant({ amount, splitMethod: 'shares', participants: entries });

    it('divides ₱800 by weight 2:1:1 into 400 / 200 / 200', async () => {
        const res = await post(
            shares([
                { memberId: named.Paul, shares: 2 },
                { memberId: named.John, shares: 1 },
                { memberId: named.Mike, shares: 1 },
            ])
        );

        expect(res.body.splitMethod).toBe('SHARES');
        expect(shareFor(res.body, named.Paul).amount).toBe(400);
        expect(shareFor(res.body, named.John).amount).toBe(200);
        expect(shareFor(res.body, named.Mike).amount).toBe(200);
        expect(sumCentavos(res.body)).toBe(80000);
    });

    it('remembers the weights', async () => {
        const res = await post(
            shares([
                { memberId: named.Paul, shares: 2 },
                { memberId: named.John, shares: 1 },
            ])
        );
        expect(shareFor(res.body, named.Paul).splitInput).toBe('2');
        expect(shareFor(res.body, named.John).splitInput).toBe('1');
    });

    it('spreads an awkward remainder without losing a centavo', async () => {
        const res = await post(
            shares(
                [
                    { memberId: named.Paul, shares: 1 },
                    { memberId: named.John, shares: 1 },
                    { memberId: named.Mike, shares: 1 },
                ],
                '100'
            )
        );
        expect(sumCentavos(res.body)).toBe(10000);
    });

    it('refuses weights that are all zero, or negative', async () => {
        const allZero = await post(
            shares([
                { memberId: named.Paul, shares: 0 },
                { memberId: named.John, shares: 0 },
            ])
        );
        expect(allZero.statusCode).toBe(400);

        const negative = await post(
            shares([
                { memberId: named.Paul, shares: -1 },
                { memberId: named.John, shares: 3 },
            ])
        );
        expect(negative.statusCode).toBe(400);
    });
});

describe('validation', () => {
    const cases = [
        ['a zero total', { amount: '0' }, 'INVALID_AMOUNT'],
        ['a negative total', { amount: '-100' }, 'INVALID_AMOUNT'],
        ['no participants', { participants: [] }, 'PARTICIPANTS_REQUIRED'],
        ['no description', { description: '  ' }, 'NAME_REQUIRED'],
        ['an unknown split method', { splitMethod: 'vibes' }, 'INVALID_SPLIT_METHOD'],
        ['an invalid date', { date: 'sometime' }, 'INVALID_DATE'],
    ];

    it.each(cases)('refuses %s', async (_label, overrides, code) => {
        const res = await post(restaurant(overrides));
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe(code);
    });

    it('refuses a missing payer', async () => {
        const res = await post(restaurant({ payerMemberId: undefined }));
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PAYER_REQUIRED');
    });

    it('refuses a payer who is not in the group', async () => {
        const res = await post(restaurant({ payerMemberId: UUID_A }));
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PAYER_NOT_IN_GROUP');
    });

    it('refuses a participant who is not in the group', async () => {
        const res = await post(
            restaurant({ participants: [{ memberId: named.Paul }, { memberId: UUID_A }] })
        );
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PARTICIPANT_NOT_IN_GROUP');
    });

    it('refuses a duplicated participant', async () => {
        const res = await post(
            restaurant({ participants: [{ memberId: named.John }, { memberId: named.John }] })
        );
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/twice/);
    });

    it('refuses an archived payer and an archived participant', async () => {
        await call(members.archiveMember, {
            params: { groupId: trip.group.id, memberId: named.Carl },
        });

        const asPayer = await post(restaurant({ payerMemberId: named.Carl }));
        expect(asPayer.body.code).toBe('PAYER_ARCHIVED');

        const asParticipant = await post(
            restaurant({ participants: [{ memberId: named.Paul }, { memberId: named.Carl }] })
        );
        expect(asParticipant.body.code).toBe('PARTICIPANT_ARCHIVED');
    });

    it('refuses writes to an archived group', async () => {
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });

        const res = await post(restaurant());
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('GROUP_ARCHIVED');
    });

    it('refuses a category belonging to someone else', async () => {
        const res = await post(restaurant({ categoryId: 99 }));
        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('refuses a request naming a server-owned field', async () => {
        const res = await post(restaurant({ groupId: UUID_A }));
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('READ_ONLY_FIELD');
    });

    it('writes nothing at all when validation fails', async () => {
        await post(restaurant({ amount: '0' }));

        expect(prisma.__db.sharedExpense).toHaveLength(0);
        expect(prisma.__db.sharedExpenseShare).toHaveLength(0);
        expect(mirrors()).toHaveLength(0);
    });
});

describe('the mirror', () => {
    it('creates exactly one row, for the user’s own share', async () => {
        await post(restaurant());

        // Five participants, one mirror. The other four shares are somebody
        // else's money and belong nowhere near this user's totals.
        expect(mirrors()).toHaveLength(1);
        expect(Number(mirrors()[0].amount)).toBe(100);
        expect(mirrors()[0].userId).toBe(PAUL);
        expect(mirrors()[0].notes).toBe('Restaurant');
        expect(mirrors()[0].categoryId).toBe(food);
    });

    it('links the bill to it, and says so without exposing the id', async () => {
        const res = await post(restaurant());
        const stored = prisma.__db.sharedExpense[0];

        expect(stored.personalExpenseId).toBe(mirrors()[0].id);
        expect(res.body.hasPersonalShare).toBe(true);
        expect(res.body).not.toHaveProperty('personalExpenseId');
    });

    it('creates none when the user paid but did not take part', async () => {
        const res = await post(
            restaurant({
                participants: [{ memberId: named.John }, { memberId: named.Mike }],
            })
        );

        expect(res.statusCode).toBe(201);
        expect(res.body.hasPersonalShare).toBe(false);
        // Paul lent ₱500 and consumed none of it. Lending is not spending.
        expect(mirrors()).toHaveLength(0);
    });

    it('creates none for a share of zero', async () => {
        await post(
            restaurant({
                splitMethod: 'fixed',
                participants: [
                    { memberId: named.Paul, amount: '0' },
                    { memberId: named.John, amount: '500' },
                ],
            })
        );

        expect(mirrors()).toHaveLength(0);
    });

    it('follows the share when the split changes, keeping the same row', async () => {
        const created = await post(restaurant());
        const originalId = mirrors()[0].id;

        await call(expenses.updateExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
            body: restaurant({
                amount: '500',
                splitMethod: 'fixed',
                participants: [
                    { memberId: named.Paul, amount: '300' },
                    { memberId: named.John, amount: '200' },
                ],
            }),
        });

        expect(mirrors()).toHaveLength(1);
        expect(mirrors()[0].id).toBe(originalId);
        expect(Number(mirrors()[0].amount)).toBe(300);
    });

    it('appears when the user joins a bill they were not on', async () => {
        const created = await post(
            restaurant({ participants: [{ memberId: named.John }, { memberId: named.Mike }] })
        );
        expect(mirrors()).toHaveLength(0);

        await call(expenses.updateExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
            body: restaurant({
                participants: [{ memberId: named.John }, { memberId: named.Paul }],
            }),
        });

        expect(mirrors()).toHaveLength(1);
        expect(Number(mirrors()[0].amount)).toBe(250);
    });

    it('goes when the user comes off the bill', async () => {
        const created = await post(restaurant());
        expect(mirrors()).toHaveLength(1);

        await call(expenses.updateExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
            body: restaurant({
                participants: [{ memberId: named.John }, { memberId: named.Mike }],
            }),
        });

        expect(mirrors()).toHaveLength(0);
        expect(prisma.__db.sharedExpense[0].personalExpenseId).toBeNull();
    });

    it('follows the description, date and category on edit', async () => {
        const created = await post(restaurant());

        await call(expenses.updateExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
            body: restaurant({ description: 'Late supper' }),
        });

        expect(mirrors()[0].notes).toBe('Late supper');
    });

    it('never creates more than one, however many times the bill is edited', async () => {
        const created = await post(restaurant());

        for (const amount of ['600', '700', '800']) {
            await call(expenses.updateExpense, {
                params: { groupId: trip.group.id, expenseId: created.body.id },
                body: restaurant({ amount }),
            });
        }

        expect(mirrors()).toHaveLength(1);
        expect(prisma.__db.sharedExpense).toHaveLength(1);
    });

    it('leaves other users’ expenses untouched', async () => {
        prisma.__db.expense.push({ id: 900, userId: STRANGER, amount: '50', categoryId: 99 });

        await post(restaurant());

        expect(mirrors().filter((row) => row.userId === STRANGER)).toHaveLength(1);
    });
});

describe('reading', () => {
    it('lists a group’s expenses, newest first', async () => {
        await post(restaurant({ description: 'Older', date: '2026-08-01T00:00:00.000Z' }));
        await post(restaurant({ description: 'Newer', date: '2026-08-03T00:00:00.000Z' }));

        const res = await call(expenses.listExpenses, { params: { groupId: trip.group.id } });

        expect(res.body.map((e) => e.description)).toEqual(['Newer', 'Older']);
    });

    it('returns one expense with its shares', async () => {
        const created = await post(restaurant());

        const res = await call(expenses.getExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
        });

        expect(res.body.id).toBe(created.body.id);
        expect(res.body.shares).toHaveLength(5);
    });

    it('pins the response contract', async () => {
        const created = await post(restaurant());
        expect(Object.keys(created.body).sort()).toEqual([
            'amount',
            'categoryId',
            'createdAt',
            'date',
            'description',
            'groupId',
            'hasPersonalShare',
            'id',
            'note',
            'payerMemberId',
            'shares',
            'splitMethod',
            'shares'.replace('shares', 'updatedAt'),
        ].sort());
    });

    it('answers 400 for a malformed expense id and 404 for an unknown one', async () => {
        const malformed = await call(expenses.getExpense, {
            params: { groupId: trip.group.id, expenseId: 'nope' },
        });
        expect(malformed.statusCode).toBe(400);

        const missing = await call(expenses.getExpense, {
            params: { groupId: trip.group.id, expenseId: UUID_A },
        });
        expect(missing.statusCode).toBe(404);
    });
});

describe('deleting', () => {
    it('removes the bill, its shares and its mirror together', async () => {
        const created = await post(restaurant());
        expect(prisma.__db.sharedExpenseShare).toHaveLength(5);

        const res = await call(expenses.deleteExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
        });

        expect(res.body).toEqual({ deleted: true });
        expect(prisma.__db.sharedExpense).toHaveLength(0);
        expect(prisma.__db.sharedExpenseShare).toHaveLength(0);
        expect(mirrors()).toHaveLength(0);
    });

    it('unlinks before deleting, so the restrict guard cannot bite', async () => {
        // personalExpenseId is onDelete: Restrict. Deleting the mirror while
        // the bill still points at it is refused by the database, which is
        // exactly why the order in deleteWithMirror matters.
        const created = await post(restaurant());
        const res = await call(expenses.deleteExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
        });

        expect(res.statusCode).toBe(200);
    });

    it('leaves a bill with no mirror alone', async () => {
        const created = await post(
            restaurant({ participants: [{ memberId: named.John }] })
        );

        const res = await call(expenses.deleteExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
        });
        expect(res.body).toEqual({ deleted: true });
    });

    it('leaves other bills in the group standing', async () => {
        const first = await post(restaurant({ description: 'One' }));
        await post(restaurant({ description: 'Two' }));

        await call(expenses.deleteExpense, {
            params: { groupId: trip.group.id, expenseId: first.body.id },
        });

        expect(prisma.__db.sharedExpense).toHaveLength(1);
        expect(prisma.__db.sharedExpenseShare).toHaveLength(5);
        expect(mirrors()).toHaveLength(1);
    });
});

describe('tenant isolation', () => {
    let theirs;

    beforeEach(async () => {
        const setup = await setUpTrip(STRANGER);
        const res = await call(expenses.createExpense, {
            user: STRANGER,
            params: { groupId: setup.group.id },
            body: {
                description: 'Their dinner',
                amount: '300',
                categoryId: 99,
                payerMemberId: setup.byName.Stranger,
                splitMethod: 'equal',
                participants: [{ memberId: setup.byName.Stranger }],
            },
        });
        theirs = { group: setup.group, expense: res.body };
    });

    it('was set up as a real expense belonging to the other account', () => {
        expect(theirs.expense.amount).toBe(300);
    });

    it('cannot be listed, read, edited or deleted by anybody else', async () => {
        const params = { groupId: theirs.group.id, expenseId: theirs.expense.id };

        const list = await call(expenses.listExpenses, { params: { groupId: theirs.group.id } });
        const read = await call(expenses.getExpense, { params });
        const edit = await call(expenses.updateExpense, { params, body: restaurant() });
        const removed = await call(expenses.deleteExpense, { params });

        [list, read, edit, removed].forEach((res) => expect(res.statusCode).toBe(404));
        expect(prisma.__db.sharedExpense.some((e) => e.id === theirs.expense.id)).toBe(true);
    });

    it('cannot be reached through a group the caller does own', async () => {
        // Both ids are real. Only the pairing is wrong — which is what a lookup
        // by expense id alone would let straight through.
        const res = await call(expenses.getExpense, {
            params: { groupId: trip.group.id, expenseId: theirs.expense.id },
        });

        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe('EXPENSE_NOT_FOUND');
    });

    it('cannot be edited to name a member of another group', async () => {
        const created = await post(restaurant());
        const strangerMember = theirs.group.members[0].id;

        const res = await call(expenses.updateExpense, {
            params: { groupId: trip.group.id, expenseId: created.body.id },
            body: restaurant({ payerMemberId: strangerMember }),
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PAYER_NOT_IN_GROUP');
    });

    it('answers 404 rather than 403, indistinguishably from an invented id', async () => {
        const real = await call(expenses.getExpense, {
            params: { groupId: theirs.group.id, expenseId: theirs.expense.id },
        });
        const invented = await call(expenses.getExpense, {
            params: { groupId: UUID_A, expenseId: UUID_A },
        });

        expect(real.statusCode).toBe(404);
        expect(real.body).toEqual(invented.body);
    });

    it('never touches another account’s mirror', async () => {
        const before = mirrors().filter((row) => row.userId === STRANGER).length;

        await call(expenses.deleteExpense, {
            params: { groupId: theirs.group.id, expenseId: theirs.expense.id },
        });

        expect(mirrors().filter((row) => row.userId === STRANGER)).toHaveLength(before);
    });
});
