const prisma = require('../lib/prisma');
const {
    requireOwnedGroup,
    requireWritableGroup,
    respondToGroupError,
} = require('../lib/groupAccess');
const {
    MAX_GROUP_NAME,
    MAX_DESCRIPTION,
    validateUuidParam,
    rejectProtectedFields,
    requiredText,
    optionalText,
    optionalColor,
    selfMemberName,
} = require('../lib/groupValidation');

// Two people can both have a "Bohol Laag"; one person cannot have two.
const DUPLICATE_NAME = {
    error: 'You already have a group with that name.',
    code: 'DUPLICATE_GROUP_NAME',
};

const isDuplicateName = (error) => error?.code === 'P2002';

// Shaped by hand rather than handed straight out of Prisma. A raw row grows a
// field every time the schema does — including, before long, Decimal amounts
// that JSON turns into strings — and every one of those would reach the app
// without anybody deciding it should.
const toGroupSummary = (group, memberCount) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    archivedAt: group.archivedAt,
    memberCount,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
});

const toMember = (member) => ({
    id: member.id,
    name: member.name,
    contactNote: member.contactNote,
    isCurrentUser: member.isCurrentUser,
    archivedAt: member.archivedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
});

const toGroupDetail = (group) => ({
    ...toGroupSummary(group, group.members.length),
    members: group.members.map(toMember),
});

// `?archived=true` means archived ONLY, not "active plus archived". A list
// screen shows one or the other behind a toggle, and a flag that quietly
// widened the result would put finished trips back among the live ones.
const listGroups = async (req, res) => {
    const archivedOnly = req.query.archived === 'true';

    try {
        const groups = await prisma.expenseGroup.findMany({
            where: {
                userId: req.user.id,
                archivedAt: archivedOnly ? { not: null } : null,
            },
            // Most recently touched first: the group being spent in is the one
            // the user is coming back to.
            orderBy: { updatedAt: 'desc' },
            include: { _count: { select: { members: true } } },
        });

        // No balances here. The endpoints that record expenses and settlements
        // do not exist yet, and a zero would be indistinguishable from a real
        // settled balance — a number the app would be inventing.
        res.json(groups.map((group) => toGroupSummary(group, group._count.members)));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch groups');
    }
};

const getGroup = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return res.status(400).json({ error: badId.error.message, code: badId.error.code });
    }

    try {
        const group = await requireOwnedGroup(req.user.id, req.params.groupId, {
            include: { members: { orderBy: [{ isCurrentUser: 'desc' }, { name: 'asc' }] } },
        });

        res.json(toGroupDetail(group));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch that group');
    }
};

// The group and the member standing for the account holder are created
// together or not at all. The database enforces at most one self-member per
// group through a partial unique index; this transaction is what enforces at
// least one, and a group without one would have no answer to "whose balance is
// this" — so a failure here has to take the group with it.
const createGroup = async (req, res) => {
    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return res
            .status(400)
            .json({ error: protectedField.error.message, code: protectedField.error.code });
    }

    const name = requiredText(req.body?.name, { label: 'Group name', max: MAX_GROUP_NAME });
    if (name.error) {
        return res.status(400).json({ error: name.error.message, code: name.error.code });
    }

    const description =
        req.body?.description === undefined
            ? { value: null }
            : optionalText(req.body.description, { label: 'Description', max: MAX_DESCRIPTION });
    if (description.error) {
        return res
            .status(400)
            .json({ error: description.error.message, code: description.error.code });
    }

    const color = req.body?.color === undefined ? { value: null } : optionalColor(req.body.color);
    if (color.error) {
        return res.status(400).json({ error: color.error.message, code: color.error.code });
    }

    try {
        const profile = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { name: true },
        });

        const group = await prisma.$transaction(async (tx) => {
            const created = await tx.expenseGroup.create({
                data: {
                    userId: req.user.id,
                    name: name.value,
                    description: description.value,
                    color: color.value,
                    members: {
                        create: {
                            name: selfMemberName(profile?.name),
                            isCurrentUser: true,
                        },
                    },
                },
                include: { members: true },
            });

            return created;
        });

        res.status(201).json(toGroupDetail(group));
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json(DUPLICATE_NAME);
        }
        respondToGroupError(error, res, 'Failed to create that group');
    }
};

// Partial: a field left out is left alone. Only the three the user chose are
// editable — ownership, archive state and timestamps belong to the server, and
// a request naming one is refused rather than ignored.
const updateGroup = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return res.status(400).json({ error: badId.error.message, code: badId.error.code });
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return res
            .status(400)
            .json({ error: protectedField.error.message, code: protectedField.error.code });
    }

    const data = {};

    if (req.body?.name !== undefined) {
        const name = requiredText(req.body.name, { label: 'Group name', max: MAX_GROUP_NAME });
        if (name.error) {
            return res.status(400).json({ error: name.error.message, code: name.error.code });
        }
        data.name = name.value;
    }

    if (req.body?.description !== undefined) {
        const description = optionalText(req.body.description, {
            label: 'Description',
            max: MAX_DESCRIPTION,
        });
        if (description.error) {
            return res
                .status(400)
                .json({ error: description.error.message, code: description.error.code });
        }
        data.description = description.value;
    }

    if (req.body?.color !== undefined) {
        const color = optionalColor(req.body.color);
        if (color.error) {
            return res.status(400).json({ error: color.error.message, code: color.error.code });
        }
        data.color = color.value;
    }

    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No fields to update', code: 'NO_FIELDS' });
    }

    try {
        // Ownership and archive state first, so an archived group is refused
        // before anything is written, and another user's id is not found at all.
        await requireWritableGroup(req.user.id, req.params.groupId);

        const group = await prisma.expenseGroup.update({
            where: { id: req.params.groupId },
            data,
            include: { members: { orderBy: [{ isCurrentUser: 'desc' }, { name: 'asc' }] } },
        });

        res.json(toGroupDetail(group));
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json(DUPLICATE_NAME);
        }
        respondToGroupError(error, res, 'Failed to update that group');
    }
};

// Archiving twice is not an error — the caller asked for a state, and that
// state holds. Same for unarchiving something already active.
const setArchived = (archived) => async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return res.status(400).json({ error: badId.error.message, code: badId.error.code });
    }

    try {
        // Deliberately requireOwnedGroup rather than requireWritableGroup:
        // unarchiving an archived group is the one write it must still accept.
        const existing = await requireOwnedGroup(req.user.id, req.params.groupId);

        const group =
            Boolean(existing.archivedAt) === archived
                ? await prisma.expenseGroup.findFirst({
                      where: { id: existing.id, userId: req.user.id },
                      include: { members: { orderBy: [{ isCurrentUser: 'desc' }, { name: 'asc' }] } },
                  })
                : await prisma.expenseGroup.update({
                      where: { id: existing.id },
                      data: { archivedAt: archived ? new Date() : null },
                      include: { members: { orderBy: [{ isCurrentUser: 'desc' }, { name: 'asc' }] } },
                  });

        res.json(toGroupDetail(group));
    } catch (error) {
        respondToGroupError(
            error,
            res,
            archived ? 'Failed to archive that group' : 'Failed to unarchive that group'
        );
    }
};

// Deletion is for a group that never really started. Anything carrying
// financial history is refused and pointed at archive instead, because the
// rows behind it are somebody's record of who owed what.
//
// The guard counts rather than relying on a foreign key to complain: a
// constraint violation arrives as a 500-shaped surprise with a constraint name
// attached, and this needs to be a sentence the user can act on.
const deleteGroup = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return res.status(400).json({ error: badId.error.message, code: badId.error.code });
    }

    const groupId = req.params.groupId;

    try {
        // Allowed on an archived group: putting something away and then
        // deciding it was a mistake is a reasonable sequence.
        await requireOwnedGroup(req.user.id, groupId);

        const [expenses, settlements] = await Promise.all([
            prisma.sharedExpense.count({ where: { groupId } }),
            prisma.settlement.count({ where: { groupId } }),
        ]);

        if (expenses > 0 || settlements > 0) {
            return res.status(409).json({
                error: 'This group has expenses recorded in it. Archive it instead.',
                code: 'GROUP_HAS_HISTORY',
            });
        }

        // Members then group, in foreign-key order, inside one transaction.
        // Nothing here touches the Expense table: the user's own spending is
        // theirs and survives the group it was recorded alongside.
        await prisma.$transaction([
            prisma.groupMember.deleteMany({ where: { groupId } }),
            prisma.expenseGroup.deleteMany({ where: { id: groupId, userId: req.user.id } }),
        ]);

        res.json({ deleted: true });
    } catch (error) {
        respondToGroupError(error, res, 'Failed to delete that group');
    }
};

module.exports = {
    listGroups,
    getGroup,
    createGroup,
    updateGroup,
    archiveGroup: setArchived(true),
    unarchiveGroup: setArchived(false),
    deleteGroup,
    // Exported for the tests that pin the response contract.
    toGroupSummary,
    toGroupDetail,
    toMember,
};
