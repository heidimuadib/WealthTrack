const prisma = require('./prisma');

// Everything a group route is allowed to touch has to be reached through here.
//
// The rule these functions exist to make unbreakable: a group is never looked
// up by its id alone. Every query carries the authenticated user's id in the
// same where clause, so a row belonging to somebody else is not found rather
// than found-and-then-rejected. That ordering matters — a check performed after
// the read is a check somebody can forget, and the read has already happened.
//
// The ids are uuids, which makes them impractical to guess. That is
// defence in depth and nothing more. Authorisation is the where clause.

// Answering "not found" to a group that exists but belongs to someone else is
// deliberate. A 403 would confirm the id is real, which is the one fact a
// stranger holding a uuid should not be able to establish.
const GROUP_NOT_FOUND = {
    status: 404,
    code: 'GROUP_NOT_FOUND',
    message: 'Group not found',
};

const MEMBER_NOT_FOUND = {
    status: 404,
    code: 'MEMBER_NOT_FOUND',
    message: 'Member not found',
};

// An archived group is a finished one. Its history stays readable, but nothing
// in it changes again until somebody deliberately brings it back — otherwise a
// settled trip could quietly gain an expense months later.
const GROUP_ARCHIVED = {
    status: 409,
    code: 'GROUP_ARCHIVED',
    message: 'This group is archived. Unarchive it before making changes.',
};

class GroupAccessError extends Error {
    constructor({ status, code, message }) {
        super(message);
        this.name = 'GroupAccessError';
        this.status = status;
        this.code = code;
        this.expose = true;
    }
}

const notFound = () => new GroupAccessError(GROUP_NOT_FOUND);

// Reads a group the caller owns, or refuses. Never call findUnique on a group
// id: this is the only correct way in.
const requireOwnedGroup = async (userId, groupId, options = {}) => {
    const group = await prisma.expenseGroup.findFirst({
        where: { id: groupId, userId },
        ...options,
    });

    if (!group) {
        throw notFound();
    }

    return group;
};

// The same, for anything that writes. Archived groups are readable and
// unarchivable; everything else is refused while they are put away.
const requireWritableGroup = async (userId, groupId, options = {}) => {
    const group = await requireOwnedGroup(userId, groupId, options);

    if (group.archivedAt) {
        throw new GroupAccessError(GROUP_ARCHIVED);
    }

    return group;
};

// A member is addressed by two ids, and both have to match. Looking one up by
// its own id alone would let a member of somebody else's group be edited
// through a group the caller does own — the ids would both be real, and only
// the pairing would be wrong.
const requireGroupMember = async (groupId, memberId) => {
    const member = await prisma.groupMember.findFirst({
        where: { id: memberId, groupId },
    });

    if (!member) {
        throw new GroupAccessError(MEMBER_NOT_FOUND);
    }

    return member;
};

// Turns the errors above into responses, and everything else into a 500 that
// says nothing. A Prisma message can name a constraint, a column, or the value
// that collided; none of that is the caller's business.
const respondToGroupError = (error, res, fallback) => {
    if (error instanceof GroupAccessError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
    }

    if (error?.code === 'P2025') {
        return res
            .status(GROUP_NOT_FOUND.status)
            .json({ error: GROUP_NOT_FOUND.message, code: GROUP_NOT_FOUND.code });
    }

    // Code only. Group and member names are the user's own contacts, and a
    // stack trace carrying one is a name written into a server log for ever.
    console.error('[groups] request failed', error?.code || 'unknown');
    return res.status(500).json({ error: fallback, code: 'SERVER_ERROR' });
};

module.exports = {
    GroupAccessError,
    GROUP_NOT_FOUND,
    MEMBER_NOT_FOUND,
    GROUP_ARCHIVED,
    requireOwnedGroup,
    requireWritableGroup,
    requireGroupMember,
    respondToGroupError,
};
