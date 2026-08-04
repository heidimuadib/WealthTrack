jest.mock('../../lib/prisma', () => require('../../../test/fakePrisma').createFakePrisma());

const prisma = require('../../lib/prisma');
const groups = require('../group.controller');
const members = require('../groupMember.controller');
const shared = require('../sharedExpense.controller');

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
let errorSpy;

const setUpTrip = async (user, groupName, people) => {
    const created = await call(groups.createGroup, { user, body: { name: groupName } });
    for (const person of people) {
        await call(members.addMember, {
            user,
            params: { groupId: created.body.id },
            body: { name: person },
        });
    }
    const detail = await call(groups.getGroup, { user, params: { groupId: created.body.id } });
    const byName = Object.fromEntries(detail.body.members.map((m) => [m.name, m.id]));
    byName.self = detail.body.members.find((m) => m.isCurrentUser).id;
    return { group: detail.body, byName };
};

// A ₱300 bill split three ways: Paul, John, Mike.
const recordBill = (overrides = {}) =>
    call(shared.createExpense, {
        params: { groupId: trip.id },
        body: {
            description: 'Restaurant',
            amount: '300',
            categoryId: 7,
            payerMemberId: named.self,
            splitMethod: 'equal',
            participants: [
                { memberId: named.self },
                { memberId: named.John },
                { memberId: named.Mike },
            ],
            ...overrides,
        },
    });

const edit = (expenseId, overrides = {}) =>
    call(shared.updateExpense, {
        params: { groupId: trip.id, expenseId },
        body: {
            description: 'Restaurant',
            amount: '300',
            categoryId: 7,
            payerMemberId: named.self,
            splitMethod: 'equal',
            participants: [
                { memberId: named.self },
                { memberId: named.John },
                { memberId: named.Mike },
            ],
            ...overrides,
        },
    });

const archive = (memberId) =>
    call(members.archiveMember, { params: { groupId: trip.id, memberId } });

beforeEach(async () => {
    Object.keys(prisma.__db).forEach((model) => {
        prisma.__db[model].length = 0;
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    prisma.__seedUser(PAUL, 'Paul');
    prisma.__seedUser(STRANGER, 'Stranger');
    prisma.__db.category.push({ id: 7, userId: PAUL, name: 'Food' });
    prisma.__db.category.push({ id: 99, userId: STRANGER, name: 'Theirs' });

    const setup = await setUpTrip(PAUL, 'Cebu', ['John', 'Mike', 'Anne']);
    trip = setup.group;
    named = setup.byName;
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('creating a bill is unchanged', () => {
    it('still refuses an archived payer', async () => {
        await archive(named.John);

        const res = await recordBill({
            payerMemberId: named.John,
            participants: [{ memberId: named.self }, { memberId: named.John }],
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PAYER_ARCHIVED');
    });

    it('still refuses an archived participant', async () => {
        await archive(named.Mike);

        const res = await recordBill();

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PARTICIPANT_ARCHIVED');
    });

    it('still accepts active members', async () => {
        expect((await recordBill()).statusCode).toBe(201);
    });
});

describe('editing a bill that names somebody who has since left', () => {
    let expenseId;

    beforeEach(async () => {
        const created = await recordBill();
        expenseId = created.body.id;
        await archive(named.Mike);
    });

    it('lets the description be fixed', async () => {
        // The whole point. Before this, archiving one member froze every bill
        // they had ever appeared on — a typo could never be corrected again.
        const res = await edit(expenseId, { description: 'Restaurant (fixed typo)' });

        expect(res.statusCode).toBe(200);
        expect(res.body.description).toBe('Restaurant (fixed typo)');
    });

    it.each([
        ['a note', { note: 'Paid in cash' }],
        ['the date', { date: '2026-07-30T00:00:00.000Z' }],
        ['the amount', { amount: '330' }],
    ])('lets %s be changed', async (_label, overrides) => {
        const res = await edit(expenseId, overrides);
        expect(res.statusCode).toBe(200);
    });

    it('keeps the archived member on the bill, with their share', async () => {
        const res = await edit(expenseId, { amount: '300' });

        const mikeShare = res.body.shares.find((share) => share.memberId === named.Mike);
        expect(mikeShare).toBeTruthy();
        expect(mikeShare.amount).toBe(100);
        expect(res.body.shares).toHaveLength(3);
    });

    it('lets an archived payer stay the payer', async () => {
        // A different bill, paid by somebody who is archived afterwards.
        const theirs = await recordBill({
            description: 'Coffee',
            amount: '100',
            payerMemberId: named.Anne,
            participants: [{ memberId: named.self }, { memberId: named.Anne }],
        });
        await archive(named.Anne);

        const res = await call(shared.updateExpense, {
            params: { groupId: trip.id, expenseId: theirs.body.id },
            body: {
                description: 'Coffee and pastries',
                amount: '100',
                categoryId: 7,
                payerMemberId: named.Anne,
                splitMethod: 'equal',
                participants: [{ memberId: named.self }, { memberId: named.Anne }],
            },
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.payerMemberId).toBe(named.Anne);
    });
});

describe('archived members still cannot be added', () => {
    let expenseId;

    beforeEach(async () => {
        const created = await recordBill();
        expenseId = created.body.id;
        await archive(named.Mike);
        await archive(named.Anne);
    });

    it('refuses a different archived participant', async () => {
        // Mike is already on this bill; Anne is not. Being archived and in the
        // group is not enough — the bill has to already name them.
        const res = await edit(expenseId, {
            amount: '400',
            participants: [
                { memberId: named.self },
                { memberId: named.John },
                { memberId: named.Mike },
                { memberId: named.Anne },
            ],
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PARTICIPANT_ARCHIVED');
        expect(res.body.error).toContain('Anne');
    });

    it('refuses a different archived payer', async () => {
        const res = await edit(expenseId, { payerMemberId: named.Anne });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PAYER_ARCHIVED');
    });

    it('still lets an active member be added', async () => {
        await call(members.unarchiveMember, {
            params: { groupId: trip.id, memberId: named.Anne },
        });

        const res = await edit(expenseId, {
            amount: '400',
            participants: [
                { memberId: named.self },
                { memberId: named.John },
                { memberId: named.Mike },
                { memberId: named.Anne },
            ],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.shares).toHaveLength(4);
    });
});

describe('removing an archived member from a bill', () => {
    it('is allowed when the remaining split still adds up', async () => {
        const created = await recordBill();
        await archive(named.Mike);

        const res = await edit(created.body.id, {
            amount: '200',
            participants: [{ memberId: named.self }, { memberId: named.John }],
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.shares).toHaveLength(2);
        expect(res.body.shares.some((share) => share.memberId === named.Mike)).toBe(false);
    });

    it('is still refused when the split no longer adds up', async () => {
        // The archived-member allowance changes nothing about the money rules.
        const created = await call(shared.createExpense, {
            params: { groupId: trip.id },
            body: {
                description: 'Restaurant',
                amount: '300',
                categoryId: 7,
                payerMemberId: named.self,
                splitMethod: 'fixed',
                participants: [
                    { memberId: named.self, amount: '100' },
                    { memberId: named.John, amount: '100' },
                    { memberId: named.Mike, amount: '100' },
                ],
            },
        });
        await archive(named.Mike);

        const res = await call(shared.updateExpense, {
            params: { groupId: trip.id, expenseId: created.body.id },
            body: {
                description: 'Restaurant',
                amount: '300',
                categoryId: 7,
                payerMemberId: named.self,
                splitMethod: 'fixed',
                participants: [
                    { memberId: named.self, amount: '100' },
                    { memberId: named.John, amount: '100' },
                ],
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('INVALID_SPLIT');
    });
});

describe('nothing else moved', () => {
    it('still refuses a member from another group', async () => {
        const theirs = await setUpTrip(STRANGER, 'Their trip', ['Ken']);
        const created = await recordBill();
        await archive(named.Mike);

        const res = await edit(created.body.id, {
            participants: [
                { memberId: named.self },
                { memberId: named.John },
                { memberId: theirs.byName.Ken },
            ],
        });

        // Not archived-anything: an id from another group is not in this
        // group's member list at all, which is checked first.
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('PARTICIPANT_NOT_IN_GROUP');
    });

    it('still refuses another account’s expense entirely', async () => {
        const theirs = await setUpTrip(STRANGER, 'Their trip', ['Ken']);
        const theirBill = await call(shared.createExpense, {
            user: STRANGER,
            params: { groupId: theirs.group.id },
            body: {
                description: 'Their dinner',
                amount: '100',
                categoryId: 99,
                payerMemberId: theirs.byName.self,
                splitMethod: 'equal',
                participants: [{ memberId: theirs.byName.self }],
            },
        });

        const res = await call(shared.updateExpense, {
            user: PAUL,
            params: { groupId: theirs.group.id, expenseId: theirBill.body.id },
            body: { description: 'Hijacked' },
        });

        expect(res.statusCode).toBe(404);
    });

    it('keeps the mirror in step, and only ever one of them', async () => {
        const created = await recordBill();
        await archive(named.Mike);

        expect(prisma.__db.expense).toHaveLength(1);
        expect(Number(prisma.__db.expense[0].amount)).toBe(100);

        await edit(created.body.id, { amount: '600' });

        // Still one row, now carrying the user's new share of 200.
        expect(prisma.__db.expense).toHaveLength(1);
        expect(Number(prisma.__db.expense[0].amount)).toBe(200);
    });

    it('removes the mirror when the user comes off a bill with an archived member', async () => {
        const created = await recordBill();
        await archive(named.Mike);

        await edit(created.body.id, {
            amount: '200',
            participants: [{ memberId: named.John }, { memberId: named.Mike }],
        });

        expect(prisma.__db.expense).toHaveLength(0);
    });

    it('changes no response field', async () => {
        const created = await recordBill();
        await archive(named.Mike);
        const res = await edit(created.body.id, { description: 'Restaurant' });

        expect(Object.keys(res.body).sort()).toEqual(
            [
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
                'updatedAt',
            ].sort()
        );
    });
});
