const prisma = require('../lib/prisma');
const {
    requireWritableGroup,
    requireGroupMember,
    respondToGroupError,
} = require('../lib/groupAccess');
const {
    MAX_MEMBER_NAME,
    MAX_CONTACT_NOTE,
    validateUuidParam,
    rejectProtectedFields,
    requiredText,
    optionalText,
} = require('../lib/groupValidation');
const { toMember } = require('./group.controller');

const DUPLICATE_NAME = {
    error: 'Someone with that name is already in this group.',
    code: 'DUPLICATE_MEMBER_NAME',
};

// Two members with the same name cannot be told apart on a settlement screen,
// which is the screen where being wrong costs somebody money. The database says
// so too, through @@unique([groupId, name]).
const isDuplicateName = (error) => error?.code === 'P2002';

// The member standing for the account holder is the hinge the whole feature
// turns on: it decides whose share becomes a personal expense and whose balance
// every summary is written from. It can be renamed — a group nickname is often
// not a profile name — but it cannot be archived, deleted, or stop being the
// self-member.
const SELF_MEMBER_PROTECTED = {
    error: 'That member is you, and cannot be removed from your own group.',
    code: 'SELF_MEMBER_PROTECTED',
};

// Both ids are validated before either is used, so a malformed one is a clean
// 400 rather than a lookup that happens to miss.
const validateIds = (req) =>
    validateUuidParam(req.params.groupId, 'group') ||
    validateUuidParam(req.params.memberId, 'member');

const badRequest = (res, problem) =>
    res.status(400).json({ error: problem.error.message, code: problem.error.code });

const addMember = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    const name = requiredText(req.body?.name, { label: 'Member name', max: MAX_MEMBER_NAME });
    if (name.error) {
        return badRequest(res, name);
    }

    const contactNote =
        req.body?.contactNote === undefined
            ? { value: null }
            : optionalText(req.body.contactNote, {
                  label: 'Contact note',
                  max: MAX_CONTACT_NOTE,
              });
    if (contactNote.error) {
        return badRequest(res, contactNote);
    }

    try {
        // Ownership and archive state before anything is written. The group id
        // comes from the resolved group rather than from the URL, so a request
        // cannot attach a member to a group it does not own even if the two
        // disagreed.
        const group = await requireWritableGroup(req.user.id, req.params.groupId);

        const member = await prisma.groupMember.create({
            data: {
                groupId: group.id,
                name: name.value,
                contactNote: contactNote.value,
                // Never from the request. rejectProtectedFields refuses a body
                // that mentions it at all, and this is the second lock.
                isCurrentUser: false,
            },
        });

        res.status(201).json(toMember(member));
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json(DUPLICATE_NAME);
        }
        respondToGroupError(error, res, 'Failed to add that member');
    }
};

const updateMember = async (req, res) => {
    const badId = validateIds(req);
    if (badId) {
        return badRequest(res, badId);
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    const data = {};

    if (req.body?.name !== undefined) {
        const name = requiredText(req.body.name, { label: 'Member name', max: MAX_MEMBER_NAME });
        if (name.error) {
            return badRequest(res, name);
        }
        data.name = name.value;
    }

    if (req.body?.contactNote !== undefined) {
        const contactNote = optionalText(req.body.contactNote, {
            label: 'Contact note',
            max: MAX_CONTACT_NOTE,
        });
        if (contactNote.error) {
            return badRequest(res, contactNote);
        }
        data.contactNote = contactNote.value;
    }

    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No fields to update', code: 'NO_FIELDS' });
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId);
        // Matched on both ids. A member id that is real but belongs to another
        // group is not found, which is what stops a member being edited
        // through a group that merely happens to be owned by the caller.
        const member = await requireGroupMember(group.id, req.params.memberId);

        // Renaming the self-member is allowed on purpose: what somebody is
        // called among friends is often not what their profile says, and the
        // ledger should read the way the group talks.
        const updated = await prisma.groupMember.update({
            where: { id: member.id },
            data,
        });

        res.json(toMember(updated));
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json(DUPLICATE_NAME);
        }
        respondToGroupError(error, res, 'Failed to update that member');
    }
};

// Archived members stay on every bill they were ever part of; they simply stop
// being offered as a payer or participant on new ones.
const setArchived = (archived) => async (req, res) => {
    const badId = validateIds(req);
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId);
        const member = await requireGroupMember(group.id, req.params.memberId);

        // Archiving yourself would leave the group with no member to compute a
        // balance from, and the partial unique index means no replacement can
        // be created.
        if (archived && member.isCurrentUser) {
            return res.status(409).json(SELF_MEMBER_PROTECTED);
        }

        if (Boolean(member.archivedAt) === archived) {
            return res.json(toMember(member));
        }

        const updated = await prisma.groupMember.update({
            where: { id: member.id },
            data: { archivedAt: archived ? new Date() : null },
        });

        res.json(toMember(updated));
    } catch (error) {
        // Unarchiving cannot collide on name — @@unique([groupId, name]) covers
        // archived rows too, so the name was never free to be taken — but the
        // handler is here rather than assumed, because that constraint is a
        // schema decision and schema decisions change.
        if (isDuplicateName(error)) {
            return res.status(409).json(DUPLICATE_NAME);
        }
        respondToGroupError(
            error,
            res,
            archived ? 'Failed to archive that member' : 'Failed to unarchive that member'
        );
    }
};

// Deleting is for somebody added by mistake. Once a member appears on a bill or
// a repayment they are part of the record, and the record is the point — so
// they are archived instead.
//
// Counted explicitly rather than caught from a foreign key: the four places a
// member can be referenced are worth naming in code, and a constraint violation
// would arrive as a 500 carrying a constraint name.
const deleteMember = async (req, res) => {
    const badId = validateIds(req);
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId);
        const member = await requireGroupMember(group.id, req.params.memberId);

        if (member.isCurrentUser) {
            return res.status(409).json(SELF_MEMBER_PROTECTED);
        }

        const [paid, shared, settledFrom, settledTo] = await Promise.all([
            prisma.sharedExpense.count({ where: { payerMemberId: member.id } }),
            prisma.sharedExpenseShare.count({ where: { memberId: member.id } }),
            prisma.settlement.count({ where: { fromMemberId: member.id } }),
            prisma.settlement.count({ where: { toMemberId: member.id } }),
        ]);

        if (paid + shared + settledFrom + settledTo > 0) {
            return res.status(409).json({
                error: 'That member appears on expenses in this group. Archive them instead.',
                code: 'MEMBER_HAS_HISTORY',
            });
        }

        // Scoped to the resolved group as well as the member id, so this cannot
        // reach outside the group ownership was just proven for.
        await prisma.groupMember.deleteMany({ where: { id: member.id, groupId: group.id } });

        res.json({ deleted: true });
    } catch (error) {
        respondToGroupError(error, res, 'Failed to remove that member');
    }
};

module.exports = {
    addMember,
    updateMember,
    archiveMember: setArchived(true),
    unarchiveMember: setArchived(false),
    deleteMember,
};
