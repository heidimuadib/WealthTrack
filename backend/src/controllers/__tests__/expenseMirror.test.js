jest.mock('../../lib/prisma', () => require('../../../test/fakePrisma').createFakePrisma());

const prisma = require('../../lib/prisma');
const groups = require('../group.controller');
const members = require('../groupMember.controller');
const shared = require('../sharedExpense.controller');
const { getExpenses, updateExpense, deleteExpense } = require('../expense.controller');

const PAUL = 1;
const STRANGER = 2;

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

let trip;
let named;
let food;
let errorSpy;

// A group bill Paul took part in, which materialises his ₱100 share as an
// ordinary expense row — the mirror this whole contract is about.
const recordSharedBill = async (user = PAUL, group = trip, names = named, categoryId = food) =>
    call(shared.createExpense, {
        user,
        params: { groupId: group.id },
        body: {
            description: 'Restaurant',
            amount: '500',
            categoryId,
            payerMemberId: names.self,
            splitMethod: 'equal',
            participants: [{ memberId: names.self }, { memberId: names.John }],
        },
    });

// An expense the user typed in themselves, with no group behind it.
const ordinaryExpense = (userId = PAUL, categoryId = food) =>
    prisma.__db.expense.push({
        id: 500 + prisma.__db.expense.length,
        userId,
        amount: '75.00',
        date: new Date('2026-08-02T00:00:00.000Z'),
        notes: 'Coffee',
        categoryId,
    }) && prisma.__db.expense[prisma.__db.expense.length - 1];

const setUpTrip = async (user, groupName, selfName) => {
    const created = await call(groups.createGroup, { user, body: { name: groupName } });
    await call(members.addMember, {
        user,
        params: { groupId: created.body.id },
        body: { name: 'John' },
    });
    const detail = await call(groups.getGroup, { user, params: { groupId: created.body.id } });
    const byName = Object.fromEntries(detail.body.members.map((m) => [m.name, m.id]));
    byName.self = detail.body.members.find((m) => m.isCurrentUser).id;
    return { group: detail.body, byName, selfName };
};

beforeEach(async () => {
    Object.keys(prisma.__db).forEach((model) => {
        prisma.__db[model].length = 0;
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    prisma.__seedUser(PAUL, 'Paul');
    prisma.__seedUser(STRANGER, 'Stranger');
    food = prisma.__db.category.push({ id: 7, userId: PAUL, name: 'Food' }) && 7;
    prisma.__db.category.push({ id: 99, userId: STRANGER, name: 'Theirs' });

    const setup = await setUpTrip(PAUL, 'Cebu', 'Paul');
    trip = setup.group;
    named = setup.byName;
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('GET /expenses — read shape', () => {
    it('marks an ordinary expense as not shared', async () => {
        ordinaryExpense();

        const res = await call(getExpenses);

        expect(res.body).toHaveLength(1);
        expect(res.body[0].sharedExpense).toBeNull();
    });

    it('carries exactly two ids for a mirrored expense', async () => {
        const bill = await recordSharedBill();

        const res = await call(getExpenses);
        const mirror = res.body.find((row) => row.sharedExpense !== null);

        expect(mirror).toBeTruthy();
        expect(mirror.amount).toBe('250.00');
        // Enough to badge the row and open the bill behind it, and nothing more.
        expect(Object.keys(mirror.sharedExpense).sort()).toEqual(['groupId', 'id']);
        expect(mirror.sharedExpense.id).toBe(bill.body.id);
        expect(mirror.sharedExpense.groupId).toBe(trip.id);
    });

    it('leaks nothing else about the group', async () => {
        await recordSharedBill();

        const res = await call(getExpenses);
        const mirror = res.body.find((row) => row.sharedExpense !== null);
        const serialised = JSON.stringify(mirror);

        // No shares, no payer, no member names, no balances, no group name.
        ['shares', 'payerMemberId', 'splitMethod', 'members', 'balance', 'John', 'Cebu'].forEach(
            (leak) => expect(serialised).not.toContain(leak)
        );
    });

    it('never exposes personalExpenseId, in either direction', async () => {
        await recordSharedBill();

        const list = await call(getExpenses);
        expect(JSON.stringify(list.body)).not.toContain('personalExpenseId');

        // The group side has not started exposing it either.
        const bill = await call(shared.listExpenses, { params: { groupId: trip.id } });
        expect(JSON.stringify(bill.body)).not.toContain('personalExpenseId');
    });

    it('keeps every field the app already relied on', async () => {
        ordinaryExpense();

        const res = await call(getExpenses);

        // Additive only: the category relation and the scalar columns are
        // exactly as they were, so nothing reading this list has to change.
        ['id', 'amount', 'date', 'notes', 'categoryId', 'userId'].forEach((field) =>
            expect(res.body[0]).toHaveProperty(field)
        );
        expect(res.body[0].category).toBeTruthy();
    });

    it('stays scoped to the authenticated user', async () => {
        ordinaryExpense(PAUL);
        ordinaryExpense(STRANGER, 99);

        const mine = await call(getExpenses, { user: PAUL });
        const theirs = await call(getExpenses, { user: STRANGER });

        expect(mine.body).toHaveLength(1);
        expect(mine.body.every((row) => row.userId === PAUL)).toBe(true);
        expect(theirs.body.every((row) => row.userId === STRANGER)).toBe(true);
    });

    it('still filters by month and year', async () => {
        ordinaryExpense();

        const inside = await call(getExpenses, { query: { month: '8', year: '2026' } });
        const outside = await call(getExpenses, { query: { month: '7', year: '2026' } });

        expect(inside.body).toHaveLength(1);
        expect(outside.body).toHaveLength(0);
    });
});

describe('PUT /expenses/:id — mirror guard', () => {
    it('refuses to edit a mirrored row', async () => {
        await recordSharedBill();
        const mirror = prisma.__db.expense[0];

        const res = await call(updateExpense, {
            params: { id: String(mirror.id) },
            body: { amount: 999 },
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('EXPENSE_IS_SHARED');
        expect(res.body.error).toMatch(/group/i);
    });

    it('leaves the row exactly as it was', async () => {
        await recordSharedBill();
        const mirror = prisma.__db.expense[0];
        const before = JSON.stringify(mirror);

        await call(updateExpense, {
            params: { id: String(mirror.id) },
            body: { amount: 999, notes: 'tampered' },
        });

        expect(JSON.stringify(prisma.__db.expense[0])).toBe(before);
    });

    it('still edits an ordinary expense', async () => {
        const own = ordinaryExpense();

        const res = await call(updateExpense, {
            params: { id: String(own.id) },
            body: { amount: 120 },
        });

        expect(res.statusCode).toBe(200);
        expect(Number(prisma.__db.expense[0].amount)).toBe(120);
    });
});

describe('DELETE /expenses/:id — mirror guard', () => {
    it('refuses to delete a mirrored row', async () => {
        await recordSharedBill();
        const mirror = prisma.__db.expense[0];

        const res = await call(deleteExpense, { params: { id: String(mirror.id) } });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('EXPENSE_IS_SHARED');
        expect(prisma.__db.expense).toHaveLength(1);
    });

    it('leaves the bill still pointing at it', async () => {
        const bill = await recordSharedBill();
        const mirror = prisma.__db.expense[0];

        await call(deleteExpense, { params: { id: String(mirror.id) } });

        const stored = prisma.__db.sharedExpense.find((row) => row.id === bill.body.id);
        expect(stored.personalExpenseId).toBe(mirror.id);
    });

    it('still deletes an ordinary expense', async () => {
        const own = ordinaryExpense();

        const res = await call(deleteExpense, { params: { id: String(own.id) } });

        expect(res.statusCode).toBe(200);
        expect(prisma.__db.expense).toHaveLength(0);
    });

    it('still deletes the mirror when the group expense goes', async () => {
        // The one route that may remove it, because it goes through the group
        // ledger rather than around it.
        const bill = await recordSharedBill();

        await call(shared.deleteExpense, {
            params: { groupId: trip.id, expenseId: bill.body.id },
        });

        expect(prisma.__db.expense).toHaveLength(0);
    });
});

describe('ownership is still decided before anything else', () => {
    let theirMirrorId;

    beforeEach(async () => {
        const setup = await setUpTrip(STRANGER, 'Their trip', 'Stranger');
        await recordSharedBill(STRANGER, setup.group, setup.byName, 99);
        theirMirrorId = prisma.__db.expense.find((row) => row.userId === STRANGER).id;
    });

    it('answers 404 for another account’s mirror, never 409', async () => {
        const updated = await call(updateExpense, {
            user: PAUL,
            params: { id: String(theirMirrorId) },
            body: { amount: 1 },
        });
        const removed = await call(deleteExpense, {
            user: PAUL,
            params: { id: String(theirMirrorId) },
        });

        // A 409 would confirm the id is real and that it belongs to a group.
        [updated, removed].forEach((res) => {
            expect(res.statusCode).toBe(404);
            expect(res.body.code).toBeUndefined();
        });
        expect(prisma.__db.expense.some((row) => row.id === theirMirrorId)).toBe(true);
    });

    it('answers the same 404 for an id that does not exist at all', async () => {
        const guessed = await call(updateExpense, {
            user: PAUL,
            params: { id: '987654' },
            body: { amount: 1 },
        });
        const theirs = await call(updateExpense, {
            user: PAUL,
            params: { id: String(theirMirrorId) },
            body: { amount: 1 },
        });

        expect(guessed.statusCode).toBe(404);
        expect(guessed.body).toEqual(theirs.body);
    });

    it('keeps another account’s mirror out of the caller’s list', async () => {
        const res = await call(getExpenses, { user: PAUL });
        expect(res.body.some((row) => row.id === theirMirrorId)).toBe(false);
    });
});

describe('error responses', () => {
    it('leak no Prisma or constraint detail', async () => {
        await recordSharedBill();
        const mirror = prisma.__db.expense[0];

        const res = await call(deleteExpense, { params: { id: String(mirror.id) } });

        expect(res.body.error).not.toMatch(/P200|constraint|Restrict|foreign key|prisma/i);
        expect(res.body).toEqual({
            error: 'This came from a group expense. Open the group to change it.',
            code: 'EXPENSE_IS_SHARED',
        });
    });

    it('still answer 400 for a malformed id', async () => {
        expect((await call(updateExpense, { params: { id: 'abc' }, body: { amount: 1 } })).statusCode).toBe(400);
        expect((await call(deleteExpense, { params: { id: 'abc' } })).statusCode).toBe(400);
    });
});
