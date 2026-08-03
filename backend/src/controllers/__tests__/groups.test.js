// Built inside the factory because jest hoists this above everything else in
// the file. One instance, shared by the controllers and by the assertions
// below, reset between tests.
jest.mock('../../lib/prisma', () => require('../../../test/fakePrisma').createFakePrisma());

const prisma = require('../../lib/prisma');
const groups = require('../group.controller');
const members = require('../groupMember.controller');

const ALICE = 1;
const BOB = 2;

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

const call = async (handler, { user = ALICE, params = {}, body = {}, query = {} } = {}) => {
    const res = mockRes();
    await handler({ user: { id: user }, params, body, query }, res);
    return res;
};

// Creates a group the way the API does, and hands back its detail body.
const makeGroup = async (user, name, extra = {}) => {
    const res = await call(groups.createGroup, { user, body: { name, ...extra } });
    expect(res.statusCode).toBe(201);
    return res.body;
};

const selfMemberOf = (group) => group.members.find((member) => member.isCurrentUser);

let errorSpy;

beforeEach(() => {
    Object.keys(prisma.__db).forEach((model) => {
        prisma.__db[model].length = 0;
    });
    Object.values(prisma).forEach((delegate) => {
        if (delegate && typeof delegate === 'object') {
            Object.values(delegate).forEach((fn) => fn?.mockClear?.());
        }
    });
    prisma.$transaction.mockClear();

    prisma.__seedUser(ALICE, 'Paul');
    prisma.__seedUser(BOB, 'Someone Else');

    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('creating a group', () => {
    it('creates the group and its self-member together', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag', {
            description: 'Weekend trip',
            color: '#0E5A54',
        });

        expect(group.name).toBe('Bohol Laag');
        expect(group.description).toBe('Weekend trip');
        expect(group.color).toBe('#0E5A54');
        expect(group.archivedAt).toBeNull();
        expect(group.memberCount).toBe(1);
        expect(group.members).toHaveLength(1);
    });

    it('writes both rows inside one transaction', async () => {
        await makeGroup(ALICE, 'Bohol Laag');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('names the self-member from the profile', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        expect(selfMemberOf(group).name).toBe('Paul');
    });

    it('falls back to a neutral name rather than the email address', async () => {
        prisma.__db.user.find((user) => user.id === ALICE).name = '   ';
        const group = await makeGroup(ALICE, 'Nameless');

        // A member list is somewhere a name may be read aloud. The account's
        // email is never used as one.
        expect(selfMemberOf(group).name).toBe('You');
        expect(selfMemberOf(group).name).not.toMatch('@');
    });

    it('gives the group exactly one self-member', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        expect(group.members.filter((member) => member.isCurrentUser)).toHaveLength(1);
    });

    it('attaches the self-member to that group and no other', async () => {
        const first = await makeGroup(ALICE, 'First');
        const second = await makeGroup(ALICE, 'Second');

        expect(selfMemberOf(first).id).not.toBe(selfMemberOf(second).id);
        const stored = prisma.__db.groupMember.filter((member) => member.groupId === first.id);
        expect(stored).toHaveLength(1);
        expect(stored[0].isCurrentUser).toBe(true);
    });

    it('refuses a second group with the same name', async () => {
        await makeGroup(ALICE, 'Bohol Laag');
        const res = await call(groups.createGroup, { body: { name: 'Bohol Laag' } });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('DUPLICATE_GROUP_NAME');
    });

    it('lets a different user use the same name', async () => {
        await makeGroup(ALICE, 'Bohol Laag');
        const theirs = await makeGroup(BOB, 'Bohol Laag');

        expect(theirs.name).toBe('Bohol Laag');
    });

    it('refuses a blank or oversized name', async () => {
        for (const name of ['', '   ', null, 42, 'x'.repeat(81)]) {
            const res = await call(groups.createGroup, { body: { name } });
            expect(res.statusCode).toBe(400);
        }
    });

    it('trims whitespace', async () => {
        const group = await makeGroup(ALICE, '  Bohol Laag  ');
        expect(group.name).toBe('Bohol Laag');
    });

    it('refuses a colour that is not a hex value', async () => {
        const res = await call(groups.createGroup, {
            body: { name: 'Coloured', color: 'teal' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('INVALID_COLOR');
    });

    it('refuses a request that tries to set a server-owned field', async () => {
        for (const field of ['userId', 'isCurrentUser', 'archivedAt', 'id', 'createdAt']) {
            const res = await call(groups.createGroup, {
                body: { name: `Group ${field}`, [field]: 'anything' },
            });
            expect({ field, status: res.statusCode }).toEqual({ field, status: 400 });
            expect(res.body.code).toBe('READ_ONLY_FIELD');
        }
    });
});

describe('listing groups', () => {
    it('returns only the caller’s own groups', async () => {
        await makeGroup(ALICE, 'Mine');
        await makeGroup(BOB, 'Theirs');

        const res = await call(groups.listGroups, { user: ALICE });

        expect(res.body.map((group) => group.name)).toEqual(['Mine']);
    });

    it('hides archived groups by default', async () => {
        const group = await makeGroup(ALICE, 'Finished');
        await call(groups.archiveGroup, { params: { groupId: group.id } });

        const res = await call(groups.listGroups);
        expect(res.body).toHaveLength(0);
    });

    it('returns archived groups ONLY when asked, never mixed in', async () => {
        const done = await makeGroup(ALICE, 'Finished');
        await makeGroup(ALICE, 'Active');
        await call(groups.archiveGroup, { params: { groupId: done.id } });

        const res = await call(groups.listGroups, { query: { archived: 'true' } });

        expect(res.body.map((group) => group.name)).toEqual(['Finished']);
    });

    it('reports a member count and no invented balance', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        await call(members.addMember, { params: { groupId: group.id }, body: { name: 'John' } });

        const res = await call(groups.listGroups);

        expect(res.body[0].memberCount).toBe(2);
        // A zero balance and a settled balance are indistinguishable, so the
        // field is absent until the endpoints that could fill it exist.
        expect(res.body[0]).not.toHaveProperty('balance');
        expect(res.body[0]).not.toHaveProperty('netBalance');
    });

    it('pins the summary contract', async () => {
        await makeGroup(ALICE, 'Bohol Laag');
        const res = await call(groups.listGroups);

        expect(Object.keys(res.body[0]).sort()).toEqual([
            'archivedAt',
            'color',
            'createdAt',
            'description',
            'id',
            'memberCount',
            'name',
            'updatedAt',
        ]);
    });
});

describe('reading one group', () => {
    it('returns members with the self-member identified', async () => {
        const created = await makeGroup(ALICE, 'Bohol Laag');
        await call(members.addMember, { params: { groupId: created.id }, body: { name: 'John' } });

        const res = await call(groups.getGroup, { params: { groupId: created.id } });

        expect(res.body.members).toHaveLength(2);
        expect(res.body.members.filter((member) => member.isCurrentUser)).toHaveLength(1);
    });

    it('pins the member contract', async () => {
        const created = await makeGroup(ALICE, 'Bohol Laag');
        const res = await call(groups.getGroup, { params: { groupId: created.id } });

        expect(Object.keys(res.body.members[0]).sort()).toEqual([
            'archivedAt',
            'contactNote',
            'createdAt',
            'id',
            'isCurrentUser',
            'name',
            'updatedAt',
        ]);
    });

    it('identifies archived members without hiding them', async () => {
        const created = await makeGroup(ALICE, 'Bohol Laag');
        const added = await call(members.addMember, {
            params: { groupId: created.id },
            body: { name: 'John' },
        });
        await call(members.archiveMember, {
            params: { groupId: created.id, memberId: added.body.id },
        });

        const res = await call(groups.getGroup, { params: { groupId: created.id } });
        const john = res.body.members.find((member) => member.name === 'John');

        expect(john.archivedAt).not.toBeNull();
    });

    it('answers 400 for a malformed id', async () => {
        const res = await call(groups.getGroup, { params: { groupId: 'not-a-uuid' } });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('INVALID_ID');
    });

    it('answers 404 for a well-formed id that does not exist', async () => {
        const res = await call(groups.getGroup, { params: { groupId: UUID_A } });
        expect(res.statusCode).toBe(404);
    });
});

describe('tenant isolation', () => {
    let theirs;

    beforeEach(async () => {
        theirs = await makeGroup(BOB, 'Bob’s trip');
    });

    // Every one of these is the same defect: a query that resolved the group by
    // id without the caller's userId beside it.
    const asAlice = (handler, extra = {}) =>
        call(handler, { user: ALICE, params: { groupId: theirs.id, ...extra.params }, ...extra });

    it('cannot be read', async () => {
        const res = await asAlice(groups.getGroup);
        expect(res.statusCode).toBe(404);
    });

    it('cannot be updated', async () => {
        const res = await asAlice(groups.updateGroup, { body: { name: 'Hijacked' } });
        expect(res.statusCode).toBe(404);
        expect(prisma.__db.expenseGroup.find((g) => g.id === theirs.id).name).toBe('Bob’s trip');
    });

    it('cannot be archived or unarchived', async () => {
        expect((await asAlice(groups.archiveGroup)).statusCode).toBe(404);
        expect((await asAlice(groups.unarchiveGroup)).statusCode).toBe(404);
        expect(prisma.__db.expenseGroup.find((g) => g.id === theirs.id).archivedAt).toBeNull();
    });

    it('cannot be deleted', async () => {
        const res = await asAlice(groups.deleteGroup);

        expect(res.statusCode).toBe(404);
        expect(prisma.__db.expenseGroup).toHaveLength(1);
        expect(prisma.__db.groupMember).toHaveLength(1);
    });

    it('cannot gain a member', async () => {
        const res = await asAlice(members.addMember, { body: { name: 'Intruder' } });

        expect(res.statusCode).toBe(404);
        expect(prisma.__db.groupMember).toHaveLength(1);
    });

    it('never answers 403, which would confirm the id is real', async () => {
        const real = await asAlice(groups.getGroup);
        const invented = await call(groups.getGroup, {
            user: ALICE,
            params: { groupId: UUID_A },
        });

        expect(real.statusCode).toBe(404);
        expect(invented.statusCode).toBe(404);
        // Indistinguishable, deliberately.
        expect(real.body).toEqual(invented.body);
    });

    describe('their members', () => {
        let theirMember;

        beforeEach(async () => {
            const added = await call(members.addMember, {
                user: BOB,
                params: { groupId: theirs.id },
                body: { name: 'Kate' },
            });
            theirMember = added.body;
        });

        const asAliceOnMember = (handler, body = {}) =>
            call(handler, {
                user: ALICE,
                params: { groupId: theirs.id, memberId: theirMember.id },
                body,
            });

        it('cannot be updated, archived, unarchived or deleted', async () => {
            expect((await asAliceOnMember(members.updateMember, { name: 'X' })).statusCode).toBe(
                404
            );
            expect((await asAliceOnMember(members.archiveMember)).statusCode).toBe(404);
            expect((await asAliceOnMember(members.unarchiveMember)).statusCode).toBe(404);
            expect((await asAliceOnMember(members.deleteMember)).statusCode).toBe(404);

            const stored = prisma.__db.groupMember.find((m) => m.id === theirMember.id);
            expect(stored.name).toBe('Kate');
            expect(stored.archivedAt).toBeNull();
        });

        it('cannot be reached through a group the caller does own', async () => {
            // Both ids are real. Only the pairing is wrong — which is exactly
            // what a check on member id alone would let through.
            const mine = await makeGroup(ALICE, 'Mine');
            const res = await call(members.updateMember, {
                user: ALICE,
                params: { groupId: mine.id, memberId: theirMember.id },
                body: { name: 'Hijacked' },
            });

            expect(res.statusCode).toBe(404);
            expect(res.body.code).toBe('MEMBER_NOT_FOUND');
            expect(prisma.__db.groupMember.find((m) => m.id === theirMember.id).name).toBe('Kate');
        });
    });
});

describe('updating a group', () => {
    let group;

    beforeEach(async () => {
        group = await makeGroup(ALICE, 'Bohol Laag');
    });

    it('applies a partial change and leaves the rest alone', async () => {
        await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { description: 'Updated' },
        });

        const res = await call(groups.getGroup, { params: { groupId: group.id } });
        expect(res.body.name).toBe('Bohol Laag');
        expect(res.body.description).toBe('Updated');
    });

    it('accepts its own name unchanged', async () => {
        const res = await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { name: 'Bohol Laag' },
        });
        expect(res.statusCode).toBe(200);
    });

    it('refuses a name another of the caller’s groups already uses', async () => {
        await makeGroup(ALICE, 'Other');
        const res = await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { name: 'Other' },
        });

        expect(res.statusCode).toBe(409);
    });

    it('clears description and colour when sent null', async () => {
        await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { description: null, color: null },
        });

        const res = await call(groups.getGroup, { params: { groupId: group.id } });
        expect(res.body.description).toBeNull();
        expect(res.body.color).toBeNull();
    });

    it('refuses an empty change', async () => {
        const res = await call(groups.updateGroup, { params: { groupId: group.id }, body: {} });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('NO_FIELDS');
    });

    it('refuses to let the caller move the group to another account', async () => {
        const res = await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { name: 'Renamed', userId: BOB },
        });

        expect(res.statusCode).toBe(400);
        expect(prisma.__db.expenseGroup.find((g) => g.id === group.id).userId).toBe(ALICE);
    });
});

describe('archiving', () => {
    let group;

    beforeEach(async () => {
        group = await makeGroup(ALICE, 'Bohol Laag');
    });

    it('keeps an archived group readable', async () => {
        await call(groups.archiveGroup, { params: { groupId: group.id } });
        const res = await call(groups.getGroup, { params: { groupId: group.id } });

        expect(res.statusCode).toBe(200);
        expect(res.body.archivedAt).not.toBeNull();
    });

    it('is idempotent in both directions', async () => {
        const first = await call(groups.archiveGroup, { params: { groupId: group.id } });
        const second = await call(groups.archiveGroup, { params: { groupId: group.id } });

        expect(second.statusCode).toBe(200);
        expect(second.body.archivedAt).toEqual(first.body.archivedAt);

        await call(groups.unarchiveGroup, { params: { groupId: group.id } });
        const again = await call(groups.unarchiveGroup, { params: { groupId: group.id } });
        expect(again.statusCode).toBe(200);
        expect(again.body.archivedAt).toBeNull();
    });

    it('refuses every write while archived', async () => {
        await call(groups.archiveGroup, { params: { groupId: group.id } });

        const update = await call(groups.updateGroup, {
            params: { groupId: group.id },
            body: { name: 'Changed' },
        });
        const addMember = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: 'John' },
        });

        [update, addMember].forEach((res) => {
            expect(res.statusCode).toBe(409);
            expect(res.body.code).toBe('GROUP_ARCHIVED');
        });
    });

    it('restores writes on unarchive', async () => {
        await call(groups.archiveGroup, { params: { groupId: group.id } });
        await call(groups.unarchiveGroup, { params: { groupId: group.id } });

        const res = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: 'John' },
        });
        expect(res.statusCode).toBe(201);
    });
});

describe('deleting a group', () => {
    it('removes the group and its members', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        await call(members.addMember, { params: { groupId: group.id }, body: { name: 'John' } });

        const res = await call(groups.deleteGroup, { params: { groupId: group.id } });

        expect(res.body).toEqual({ deleted: true });
        expect(prisma.__db.expenseGroup).toHaveLength(0);
        expect(prisma.__db.groupMember).toHaveLength(0);
    });

    it('is allowed on an archived group', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        await call(groups.archiveGroup, { params: { groupId: group.id } });

        const res = await call(groups.deleteGroup, { params: { groupId: group.id } });
        expect(res.statusCode).toBe(200);
    });

    it('refuses a group carrying financial history', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        // Written straight into the store: the endpoints that would create this
        // row arrive in Phase 3, but the guard has to be right before they do.
        prisma.__db.sharedExpense.push({ id: 'se-1', groupId: group.id });

        const res = await call(groups.deleteGroup, { params: { groupId: group.id } });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('GROUP_HAS_HISTORY');
        expect(prisma.__db.expenseGroup).toHaveLength(1);
    });

    it('refuses a group carrying settlements', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        prisma.__db.settlement.push({ id: 'st-1', groupId: group.id });

        const res = await call(groups.deleteGroup, { params: { groupId: group.id } });
        expect(res.statusCode).toBe(409);
    });

    it('never touches a normal expense', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');

        await call(groups.deleteGroup, { params: { groupId: group.id } });

        // The group controller has no business reaching the Expense table, and
        // the user's own spending survives the group it sat beside.
        expect(prisma.expense).toBeUndefined();
    });

    it('leaves another account’s rows alone', async () => {
        const mine = await makeGroup(ALICE, 'Mine');
        await makeGroup(BOB, 'Theirs');

        await call(groups.deleteGroup, { params: { groupId: mine.id } });

        expect(prisma.__db.expenseGroup.map((g) => g.userId)).toEqual([BOB]);
        expect(prisma.__db.groupMember).toHaveLength(1);
    });
});

describe('members', () => {
    let group;

    beforeEach(async () => {
        group = await makeGroup(ALICE, 'Bohol Laag');
    });

    const addJohn = (name = 'John') =>
        call(members.addMember, { params: { groupId: group.id }, body: { name } });

    it('adds a member that is never the self-member', async () => {
        const res = await addJohn();

        expect(res.statusCode).toBe(201);
        expect(res.body.isCurrentUser).toBe(false);
    });

    it('refuses a body that tries to create a second self-member', async () => {
        const res = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: 'Impostor', isCurrentUser: true },
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('READ_ONLY_FIELD');
        expect(prisma.__db.groupMember.filter((m) => m.isCurrentUser)).toHaveLength(1);
    });

    it('refuses a duplicate name in the same group', async () => {
        await addJohn();
        const res = await addJohn();

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('DUPLICATE_MEMBER_NAME');
    });

    it('allows the same name in a different group', async () => {
        await addJohn();
        const other = await makeGroup(ALICE, 'Other trip');

        const res = await call(members.addMember, {
            params: { groupId: other.id },
            body: { name: 'John' },
        });
        expect(res.statusCode).toBe(201);
    });

    it('trims and bounds the name and note', async () => {
        const ok = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: '  John  ', contactNote: '  0912  ' },
        });
        expect(ok.body.name).toBe('John');
        expect(ok.body.contactNote).toBe('0912');

        const tooLong = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: 'x'.repeat(81) },
        });
        expect(tooLong.statusCode).toBe(400);
    });

    it('renames a member', async () => {
        const john = await addJohn();
        const res = await call(members.updateMember, {
            params: { groupId: group.id, memberId: john.body.id },
            body: { name: 'Jonathan' },
        });

        expect(res.body.name).toBe('Jonathan');
    });

    it('lets the self-member be renamed but never un-selfed', async () => {
        const self = selfMemberOf(group);

        // A group nickname is often not a profile name, so renaming is allowed.
        const renamed = await call(members.updateMember, {
            params: { groupId: group.id, memberId: self.id },
            body: { name: 'Ako' },
        });
        expect(renamed.statusCode).toBe(200);
        expect(renamed.body.name).toBe('Ako');
        expect(renamed.body.isCurrentUser).toBe(true);

        const hijack = await call(members.updateMember, {
            params: { groupId: group.id, memberId: self.id },
            body: { isCurrentUser: false },
        });
        expect(hijack.statusCode).toBe(400);
        expect(prisma.__db.groupMember.find((m) => m.id === self.id).isCurrentUser).toBe(true);
    });

    it('refuses to archive or delete the self-member', async () => {
        const self = selfMemberOf(group);
        const params = { groupId: group.id, memberId: self.id };

        const archived = await call(members.archiveMember, { params });
        const deleted = await call(members.deleteMember, { params });

        [archived, deleted].forEach((res) => {
            expect(res.statusCode).toBe(409);
            expect(res.body.code).toBe('SELF_MEMBER_PROTECTED');
        });
        expect(prisma.__db.groupMember.filter((m) => m.isCurrentUser)).toHaveLength(1);
    });

    it('archives and unarchives a member idempotently', async () => {
        const john = await addJohn();
        const params = { groupId: group.id, memberId: john.body.id };

        const first = await call(members.archiveMember, { params });
        const again = await call(members.archiveMember, { params });
        expect(again.body.archivedAt).toEqual(first.body.archivedAt);

        await call(members.unarchiveMember, { params });
        const back = await call(members.unarchiveMember, { params });
        expect(back.body.archivedAt).toBeNull();
    });

    it('deletes an unreferenced member', async () => {
        const john = await addJohn();

        const res = await call(members.deleteMember, {
            params: { groupId: group.id, memberId: john.body.id },
        });

        expect(res.body).toEqual({ deleted: true });
        expect(prisma.__db.groupMember).toHaveLength(1);
    });

    it.each([
        ['paid for an expense', 'sharedExpense', 'payerMemberId'],
        ['took part in an expense', 'sharedExpenseShare', 'memberId'],
        ['sent a settlement', 'settlement', 'fromMemberId'],
        ['received a settlement', 'settlement', 'toMemberId'],
    ])('refuses to delete a member who %s', async (_label, model, field) => {
        const john = await addJohn();
        prisma.__db[model].push({ id: `${model}-1`, groupId: group.id, [field]: john.body.id });

        const res = await call(members.deleteMember, {
            params: { groupId: group.id, memberId: john.body.id },
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('MEMBER_HAS_HISTORY');
        expect(prisma.__db.groupMember).toHaveLength(2);
    });

    it('answers 400 for a malformed member id', async () => {
        const res = await call(members.updateMember, {
            params: { groupId: group.id, memberId: 'nope' },
            body: { name: 'X' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('INVALID_ID');
    });

    it('answers 404 for a well-formed member id that is not in the group', async () => {
        const res = await call(members.updateMember, {
            params: { groupId: group.id, memberId: UUID_A },
            body: { name: 'X' },
        });
        expect(res.statusCode).toBe(404);
    });
});

describe('error responses', () => {
    it('never leaks a Prisma message or constraint name', async () => {
        const group = await makeGroup(ALICE, 'Bohol Laag');
        await call(members.addMember, { params: { groupId: group.id }, body: { name: 'John' } });

        const duplicate = await call(members.addMember, {
            params: { groupId: group.id },
            body: { name: 'John' },
        });

        expect(duplicate.body.error).not.toMatch(/P200|constraint|Unique|prisma/i);
        expect(duplicate.body).toEqual({
            error: 'Someone with that name is already in this group.',
            code: 'DUPLICATE_MEMBER_NAME',
        });
    });

    it('carries a stable code beside every message', async () => {
        const res = await call(groups.getGroup, { params: { groupId: UUID_A } });
        expect(res.body).toEqual({ error: 'Group not found', code: 'GROUP_NOT_FOUND' });
    });
});
