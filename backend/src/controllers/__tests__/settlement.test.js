jest.mock('../../lib/prisma', () => require('../../../test/fakePrisma').createFakePrisma());

const prisma = require('../../lib/prisma');
const groups = require('../group.controller');
const members = require('../groupMember.controller');
const expenses = require('../sharedExpense.controller');
const settlements = require('../settlement.controller');

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

let trip;
let named;
let food;

const setUpTrip = async (user, name) => {
    const created = await call(groups.createGroup, { user, body: { name } });
    const group = created.body;

    for (const who of ['John', 'Mike', 'Anne', 'Carl']) {
        await call(members.addMember, { user, params: { groupId: group.id }, body: { name: who } });
    }

    const detail = await call(groups.getGroup, { user, params: { groupId: group.id } });
    const byName = Object.fromEntries(detail.body.members.map((m) => [m.name, m.id]));

    return { group: detail.body, byName };
};

// The brief: Paul pays ₱500, split five ways.
const addExpense = (overrides = {}, { user = PAUL, groupId = trip.group.id } = {}) =>
    call(expenses.createExpense, {
        user,
        params: { groupId },
        body: {
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
        },
    });

const balances = ({ user = PAUL, groupId = trip.group.id } = {}) =>
    call(settlements.getBalances, { user, params: { groupId } });

const settle = (body, { user = PAUL, groupId = trip.group.id } = {}) =>
    call(settlements.createSettlement, { user, params: { groupId }, body });

const pay = (from, to, amount, extra = {}) =>
    settle({ fromMemberId: from, toMemberId: to, amount, ...extra });

const memberBalance = (body, memberId) => body.members.find((m) => m.memberId === memberId);
const pairBetween = (body, x, y) =>
    body.pairs.find(
        (p) =>
            (p.memberAId === x && p.memberBId === y) || (p.memberAId === y && p.memberBId === x)
    );

let errorSpy;

beforeEach(async () => {
    Object.keys(prisma.__db).forEach((model) => {
        prisma.__db[model].length = 0;
    });
    prisma.__transactionOptions.length = 0;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    prisma.__seedUser(PAUL, 'Paul');
    prisma.__seedUser(STRANGER, 'Stranger');
    food = prisma.__db.category.push({ id: 7, userId: PAUL, name: 'Food' }) && 7;
    prisma.__db.category.push({ id: 99, userId: STRANGER, name: 'Theirs' });

    trip = await setUpTrip(PAUL, 'Cebu');
    named = trip.byName;
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('balances — the worked example', () => {
    beforeEach(() => addExpense());

    it('leaves Paul owed ₱400 and everyone else owing ₱100', async () => {
        const res = await balances();

        expect(res.body.youAreOwed).toBe(400);
        expect(res.body.youOwe).toBe(0);
        expect(res.body.netBalance).toBe(400);
        expect(memberBalance(res.body, named.Paul).netBalance).toBe(400);
        ['John', 'Mike', 'Anne', 'Carl'].forEach((who) =>
            expect(memberBalance(res.body, named[who]).netBalance).toBe(-100)
        );
    });

    it('reports what was paid and consumed separately', async () => {
        const paul = memberBalance((await balances()).body, named.Paul);

        expect(paul.paid).toBe(500);
        expect(paul.owed).toBe(100);
        expect(paul.sentOut).toBe(0);
        expect(paul.received).toBe(0);
    });

    it('gives four pairs, each ₱100 owed to Paul', async () => {
        const res = await balances();

        expect(res.body.pairs).toHaveLength(4);
        ['John', 'Mike', 'Anne', 'Carl'].forEach((who) => {
            const pair = pairBetween(res.body, named[who], named.Paul);
            expect(pair.balance).toBe(100);
            expect(pair.direction).toEqual({
                fromMemberId: named[who],
                toMemberId: named.Paul,
            });
        });
    });

    it('names both sides of every pair and never a bare signed amount', async () => {
        const res = await balances();

        res.body.pairs.forEach((pair) => {
            expect(pair.balance).toBeGreaterThan(0);
            expect(pair.memberAName).toEqual(expect.any(String));
            expect(pair.memberBName).toEqual(expect.any(String));
            expect(pair.direction.fromMemberId).not.toBe(pair.direction.toMemberId);
        });
    });

    it('keeps the member nets summing to zero', async () => {
        const res = await balances();
        const total = res.body.members.reduce(
            (sum, m) => sum + Math.round(m.netBalance * 100),
            0
        );
        expect(total).toBe(0);
    });

    it('identifies the current user', async () => {
        const res = await balances();
        expect(res.body.currentUserMemberId).toBe(named.Paul);
        expect(memberBalance(res.body, named.Paul).isCurrentUser).toBe(true);
    });
});

describe('balances — other shapes', () => {
    it('handles somebody else paying a later expense', async () => {
        await addExpense();
        await addExpense({
            description: 'Coffee',
            amount: '100',
            payerMemberId: named.John,
            participants: [{ memberId: named.Paul }, { memberId: named.John }],
        });

        const res = await balances();
        // Paul: paid 500, owed 100 + 50 = 150 → +350
        expect(memberBalance(res.body, named.Paul).netBalance).toBe(350);
        // John: paid 100, owed 100 + 50 = 150 → -50
        expect(memberBalance(res.body, named.John).netBalance).toBe(-50);
        expect(pairBetween(res.body, named.John, named.Paul).balance).toBe(50);
    });

    it('nets two people who paid for each other', async () => {
        await addExpense({
            amount: '300',
            payerMemberId: named.Paul,
            participants: [{ memberId: named.Paul }, { memberId: named.John }],
        });
        await addExpense({
            amount: '100',
            payerMemberId: named.John,
            participants: [{ memberId: named.Paul }, { memberId: named.John }],
        });

        const res = await balances();
        // One line, not two: John owes 150, Paul owes 50, net 100.
        const pair = pairBetween(res.body, named.John, named.Paul);
        expect(pair.balance).toBe(100);
        expect(pair.direction.fromMemberId).toBe(named.John);
    });

    it('shows the current user owing when somebody else paid', async () => {
        await addExpense({
            amount: '200',
            payerMemberId: named.Mike,
            participants: [{ memberId: named.Paul }, { memberId: named.Mike }],
        });

        const res = await balances();
        expect(res.body.youOwe).toBe(100);
        expect(res.body.youAreOwed).toBe(0);
        expect(res.body.netBalance).toBe(-100);
    });

    it('leaves a one-person expense with no pair at all', async () => {
        await addExpense({ amount: '80', participants: [{ memberId: named.Paul }] });

        const res = await balances();
        expect(res.body.pairs).toHaveLength(0);
        expect(res.body.netBalance).toBe(0);
    });

    it('counts a bill the user paid but did not eat as entirely lent', async () => {
        await addExpense({
            participants: [{ memberId: named.John }, { memberId: named.Mike }],
        });

        const res = await balances();
        expect(memberBalance(res.body, named.Paul).owed).toBe(0);
        expect(res.body.youAreOwed).toBe(500);
    });

    it('gives a zero-share participant no debt', async () => {
        await addExpense({
            splitMethod: 'fixed',
            participants: [
                { memberId: named.Paul, amount: '500' },
                { memberId: named.John, amount: '0' },
            ],
        });

        const res = await balances();
        expect(memberBalance(res.body, named.John).netBalance).toBe(0);
        expect(pairBetween(res.body, named.John, named.Paul)).toBeUndefined();
    });

    it('lists every member, including those with no activity', async () => {
        const res = await balances();
        expect(res.body.members).toHaveLength(5);
        res.body.members.forEach((m) => expect(m.netBalance).toBe(0));
    });

    it('keeps archived members in the ledger', async () => {
        await addExpense();
        await call(members.archiveMember, {
            params: { groupId: trip.group.id, memberId: named.Carl },
        });

        const res = await balances();
        const carl = memberBalance(res.body, named.Carl);
        expect(carl.archivedAt).not.toBeNull();
        expect(carl.netBalance).toBe(-100);
    });

    it('is readable while the group is archived', async () => {
        await addExpense();
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });

        const res = await balances();
        expect(res.statusCode).toBe(200);
        expect(res.body.youAreOwed).toBe(400);
    });

    it('does no debt simplification', async () => {
        // John owes Paul; Mike owes Paul. Nothing may redirect John's debt to
        // Mike, or invent a pair between two people who never transacted.
        await addExpense();
        const res = await balances();

        expect(pairBetween(res.body, named.John, named.Mike)).toBeUndefined();
        expect(res.body.pairs.every((p) => [p.memberAId, p.memberBId].includes(named.Paul))).toBe(
            true
        );
    });
});

describe('recording a repayment', () => {
    beforeEach(() => addExpense());

    it('takes a partial payment and reduces both sides', async () => {
        const res = await pay(named.John, named.Paul, '40');

        expect(res.statusCode).toBe(201);
        expect(res.body.amount).toBe(40);

        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul).balance).toBe(60);
        expect(after.body.youAreOwed).toBe(360);
        expect(memberBalance(after.body, named.John).netBalance).toBe(-60);
    });

    it('settles the pair when the rest is paid', async () => {
        await pay(named.John, named.Paul, '40');
        await pay(named.John, named.Paul, '60');

        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul)).toBeUndefined();
        expect(memberBalance(after.body, named.John).netBalance).toBe(0);
        expect(after.body.youAreOwed).toBe(300);
    });

    it('accepts exactly the maximum', async () => {
        const res = await pay(named.John, named.Paul, '100');
        expect(res.statusCode).toBe(201);
    });

    it('refuses a payment larger than the debt, naming the maximum', async () => {
        const res = await pay(named.John, named.Paul, '100.01');

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('SETTLEMENT_EXCEEDS_BALANCE');
        expect(res.body.error).toMatch(/100\.00/);
        expect(prisma.__db.settlement).toHaveLength(0);
    });

    it('refuses a payment in the wrong direction', async () => {
        // Paul is owed; he does not owe John.
        const res = await pay(named.Paul, named.John, '10');

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('NO_BALANCE_TO_SETTLE');
        expect(prisma.__db.settlement).toHaveLength(0);
    });

    it('refuses a payment between two people with no debt', async () => {
        const res = await pay(named.John, named.Mike, '10');
        expect(res.body.code).toBe('NO_BALANCE_TO_SETTLE');
    });

    it('never flips the direction of a pair', async () => {
        await pay(named.John, named.Paul, '100');
        const again = await pay(named.John, named.Paul, '1');

        expect(again.statusCode).toBe(409);
        expect(again.body.code).toBe('NO_BALANCE_TO_SETTLE');
    });

    it('records method and note, and returns both member names', async () => {
        const res = await pay(named.John, named.Paul, '40', {
            method: 'GCash',
            note: 'Partial payment',
        });

        expect(res.body.method).toBe('GCash');
        expect(res.body.note).toBe('Partial payment');
        expect(res.body.fromMember).toEqual({ id: named.John, name: 'John' });
        expect(res.body.toMember).toEqual({ id: named.Paul, name: 'Paul' });
    });

    it('pins the response contract', async () => {
        const res = await pay(named.John, named.Paul, '40');
        expect(Object.keys(res.body).sort()).toEqual([
            'amount',
            'createdAt',
            'date',
            'fromMember',
            'groupId',
            'id',
            'method',
            'note',
            'toMember',
            'updatedAt',
        ]);
    });

    it('does its balance check and insert inside one serializable transaction', async () => {
        prisma.__transactionOptions.length = 0;
        await pay(named.John, named.Paul, '40');

        expect(prisma.__transactionOptions).toEqual([{ isolationLevel: 'Serializable' }]);
    });

    it.each([
        ['a zero amount', { amount: '0' }, 'INVALID_SETTLEMENT_AMOUNT'],
        ['a negative amount', { amount: '-5' }, 'INVALID_SETTLEMENT_AMOUNT'],
        ['a bad date', { date: 'whenever' }, 'INVALID_SETTLEMENT_DATE'],
    ])('refuses %s', async (_label, overrides, code) => {
        const res = await settle({
            fromMemberId: named.John,
            toMemberId: named.Paul,
            amount: '40',
            ...overrides,
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe(code);
    });

    it('refuses a missing or identical member', async () => {
        expect(
            (await settle({ toMemberId: named.Paul, amount: '10' })).body.code
        ).toBe('FROM_MEMBER_REQUIRED');
        expect(
            (await settle({ fromMemberId: named.John, amount: '10' })).body.code
        ).toBe('TO_MEMBER_REQUIRED');
        expect(
            (await pay(named.John, named.John, '10')).body.code
        ).toBe('SAME_SETTLEMENT_MEMBER');
    });

    it('refuses a member who is not in the group', async () => {
        expect((await pay(UUID_A, named.Paul, '10')).body.code).toBe('FROM_MEMBER_NOT_IN_GROUP');
        expect((await pay(named.John, UUID_A, '10')).body.code).toBe('TO_MEMBER_NOT_IN_GROUP');
    });

    it('refuses an archived member on a new repayment', async () => {
        await call(members.archiveMember, {
            params: { groupId: trip.group.id, memberId: named.John },
        });

        const res = await pay(named.John, named.Paul, '40');
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('FROM_MEMBER_ARCHIVED');
    });

    it('refuses any write while the group is archived', async () => {
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });

        const res = await pay(named.John, named.Paul, '40');
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('GROUP_ARCHIVED');
    });

    it('refuses a body naming a server-owned field', async () => {
        const res = await settle({
            fromMemberId: named.John,
            toMemberId: named.Paul,
            amount: '40',
            groupId: UUID_A,
        });
        expect(res.body.code).toBe('READ_ONLY_FIELD');
    });
});

describe('listing and reading repayments', () => {
    beforeEach(async () => {
        await addExpense();
        await pay(named.John, named.Paul, '40', { date: '2026-08-01T00:00:00.000Z' });
        await pay(named.Mike, named.Paul, '20', { date: '2026-08-03T00:00:00.000Z' });
    });

    it('lists newest first with names attached', async () => {
        const res = await call(settlements.listSettlements, {
            params: { groupId: trip.group.id },
        });

        expect(res.body).toHaveLength(2);
        expect(res.body[0].fromMember.name).toBe('Mike');
        expect(res.body[1].fromMember.name).toBe('John');
    });

    it('stays readable while archived', async () => {
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });
        const res = await call(settlements.listSettlements, {
            params: { groupId: trip.group.id },
        });
        expect(res.statusCode).toBe(200);
    });

    it('reads one repayment', async () => {
        const all = await call(settlements.listSettlements, {
            params: { groupId: trip.group.id },
        });
        const res = await call(settlements.getSettlement, {
            params: { groupId: trip.group.id, settlementId: all.body[0].id },
        });

        expect(res.body.id).toBe(all.body[0].id);
    });

    it('answers 400 for a malformed id and 404 for an unknown one', async () => {
        const malformed = await call(settlements.getSettlement, {
            params: { groupId: trip.group.id, settlementId: 'nope' },
        });
        expect(malformed.statusCode).toBe(400);

        const missing = await call(settlements.getSettlement, {
            params: { groupId: trip.group.id, settlementId: UUID_A },
        });
        expect(missing.statusCode).toBe(404);
        expect(missing.body.code).toBe('SETTLEMENT_NOT_FOUND');
    });
});

describe('editing a repayment', () => {
    let paid;

    beforeEach(async () => {
        await addExpense();
        paid = (await pay(named.John, named.Paul, '40')).body;
    });

    const edit = (body, id = paid.id) =>
        call(settlements.updateSettlement, {
            params: { groupId: trip.group.id, settlementId: id },
            body,
        });

    it('raises the amount, counting the row being replaced only once', async () => {
        // The debt is ₱100 and ₱40 of it is already covered by this very row.
        // Counted twice, the remaining balance would look like ₱60 and this
        // would be refused as an overpayment.
        const res = await edit({ amount: '60' });

        expect(res.statusCode).toBe(200);
        expect(res.body.amount).toBe(60);

        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul).balance).toBe(40);
    });

    it('raises it to the full debt', async () => {
        const res = await edit({ amount: '100' });
        expect(res.statusCode).toBe(200);

        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul)).toBeUndefined();
    });

    it('lowers the amount', async () => {
        await edit({ amount: '10' });
        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul).balance).toBe(90);
    });

    it('refuses an amount past the debt', async () => {
        const res = await edit({ amount: '100.01' });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('SETTLEMENT_EXCEEDS_BALANCE');
        expect(Number(prisma.__db.settlement[0].amount)).toBe(40);
    });

    it('edits date, method and note without touching the amount', async () => {
        const res = await edit({ method: 'Cash', note: 'Handed over' });

        expect(res.body.method).toBe('Cash');
        expect(res.body.amount).toBe(40);
    });

    it('refuses a change of direction', async () => {
        for (const field of ['fromMemberId', 'toMemberId', 'groupId']) {
            const res = await edit({ [field]: named.Mike });
            expect({ field, code: res.body.code }).toEqual({ field, code: 'READ_ONLY_FIELD' });
            expect(res.body.error).toMatch(/Delete this repayment/);
        }
    });

    it('refuses an empty change', async () => {
        expect((await edit({})).body.code).toBe('NO_FIELDS');
    });

    it('still allows editing when a member has since been archived', async () => {
        // Archiving somebody afterwards does not make what happened untrue, and
        // refusing to fix a mistyped amount because they have left the group
        // would make the history less accurate rather than more.
        await call(members.archiveMember, {
            params: { groupId: trip.group.id, memberId: named.John },
        });

        const res = await edit({ amount: '50' });
        expect(res.statusCode).toBe(200);
    });

    it('refuses any edit while the group is archived', async () => {
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });
        const res = await edit({ amount: '50' });
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('GROUP_ARCHIVED');
    });
});

describe('deleting a repayment', () => {
    let paid;

    beforeEach(async () => {
        await addExpense();
        paid = (await pay(named.John, named.Paul, '40')).body;
    });

    const remove = (id = paid.id, opts = {}) =>
        call(settlements.deleteSettlement, {
            params: { groupId: trip.group.id, settlementId: id },
            ...opts,
        });

    it('reopens the debt, because balances are derived', async () => {
        const res = await remove();

        expect(res.body).toEqual({ deleted: true });
        const after = await balances();
        expect(pairBetween(after.body, named.John, named.Paul).balance).toBe(100);
        expect(after.body.youAreOwed).toBe(400);
    });

    it('answers 404 the second time', async () => {
        await remove();
        expect((await remove()).statusCode).toBe(404);
    });

    it('touches nothing else at all', async () => {
        const before = {
            sharedExpense: prisma.__db.sharedExpense.length,
            shares: prisma.__db.sharedExpenseShare.length,
            expense: JSON.stringify(prisma.__db.expense),
            members: prisma.__db.groupMember.length,
        };

        await remove();

        expect(prisma.__db.sharedExpense).toHaveLength(before.sharedExpense);
        expect(prisma.__db.sharedExpenseShare).toHaveLength(before.shares);
        // The mirrored personal expense is untouched: a repayment is not
        // spending, and deleting one changes nothing about what was consumed.
        expect(JSON.stringify(prisma.__db.expense)).toBe(before.expense);
        expect(prisma.__db.groupMember).toHaveLength(before.members);
    });

    it('refuses while the group is archived', async () => {
        await call(groups.archiveGroup, { params: { groupId: trip.group.id } });
        const res = await remove();
        expect(res.statusCode).toBe(409);
        expect(prisma.__db.settlement).toHaveLength(1);
    });
});

describe('tenant isolation', () => {
    let theirs;

    beforeEach(async () => {
        const setup = await setUpTrip(STRANGER, 'Their trip');
        await call(expenses.createExpense, {
            user: STRANGER,
            params: { groupId: setup.group.id },
            body: {
                description: 'Their dinner',
                amount: '200',
                categoryId: 99,
                payerMemberId: setup.byName.Stranger,
                splitMethod: 'equal',
                participants: [
                    { memberId: setup.byName.Stranger },
                    { memberId: setup.byName.John },
                ],
            },
        });
        const settled = await call(settlements.createSettlement, {
            user: STRANGER,
            params: { groupId: setup.group.id },
            body: {
                fromMemberId: setup.byName.John,
                toMemberId: setup.byName.Stranger,
                amount: '50',
            },
        });
        theirs = { ...setup, settlement: settled.body };
    });

    it('was set up as real data belonging to the other account', () => {
        expect(theirs.settlement.amount).toBe(50);
    });

    it('hides their balances', async () => {
        const res = await balances({ user: PAUL, groupId: theirs.group.id });
        expect(res.statusCode).toBe(404);
    });

    it('hides their settlements from every verb', async () => {
        const params = { groupId: theirs.group.id, settlementId: theirs.settlement.id };

        const list = await call(settlements.listSettlements, {
            params: { groupId: theirs.group.id },
        });
        const read = await call(settlements.getSettlement, { params });
        const made = await call(settlements.createSettlement, {
            params: { groupId: theirs.group.id },
            body: {
                fromMemberId: theirs.byName.John,
                toMemberId: theirs.byName.Stranger,
                amount: '10',
            },
        });
        const edited = await call(settlements.updateSettlement, { params, body: { amount: '10' } });
        const removed = await call(settlements.deleteSettlement, { params });

        [list, read, made, edited, removed].forEach((res) => expect(res.statusCode).toBe(404));
        expect(prisma.__db.settlement.some((s) => s.id === theirs.settlement.id)).toBe(true);
        expect(Number(prisma.__db.settlement.find((s) => s.id === theirs.settlement.id).amount)).toBe(
            50
        );
    });

    it('cannot be reached through a group the caller does own', async () => {
        const res = await call(settlements.getSettlement, {
            params: { groupId: trip.group.id, settlementId: theirs.settlement.id },
        });

        expect(res.statusCode).toBe(404);
        expect(res.body.code).toBe('SETTLEMENT_NOT_FOUND');
    });

    it('refuses a member from another group in a repayment', async () => {
        await addExpense();
        const res = await pay(theirs.byName.John, named.Paul, '10');

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('FROM_MEMBER_NOT_IN_GROUP');
    });

    it('answers 404 indistinguishably from an invented id', async () => {
        const real = await balances({ user: PAUL, groupId: theirs.group.id });
        const invented = await balances({ user: PAUL, groupId: UUID_A });

        expect(real.body).toEqual(invented.body);
    });

    it('leaks no Prisma or constraint detail', async () => {
        const res = await pay(named.John, named.Paul, '999');
        expect(res.body.error).not.toMatch(/P20|constraint|prisma|Decimal/i);
    });
});

describe('account deletion order still holds', () => {
    it('removes settlements before the members and bills they name', async () => {
        // Phase 2 wrote the ten-step order. Phase 4 adds rows to a table that
        // was already first in it, so nothing here needed changing — this is
        // the assertion that says so out loud.
        //
        // Read off disk rather than required: importing the controller would
        // pull in the Google auth client for a check about statement ordering,
        // and leave its handles open behind the test run.
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'auth.controller.js'),
            'utf8'
        );
        const order = ['settlement', 'sharedExpenseShare', 'sharedExpense', 'groupMember', 'expenseGroup']
            .map((table) => source.indexOf(`prisma.${table}.deleteMany`));

        expect(order.every((position) => position > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(order[0]).toBeLessThan(source.indexOf('prisma.expense.deleteMany'));
    });
});
