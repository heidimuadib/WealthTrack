const prisma = require('../lib/prisma');
const {
    GroupAccessError,
    requireOwnedGroup,
    requireWritableGroup,
    respondToGroupError,
} = require('../lib/groupAccess');
const { validateUuidParam, rejectProtectedFields, optionalText } = require('../lib/groupValidation');
const { toCentavos, fromCentavos } = require('../lib/groupMoney');
const { toPeso, directedPairBalanceCentavos, groupBalanceView } = require('../lib/groupBalances');

const MAX_METHOD = 80;
const MAX_NOTE = 500;

// A repayment is addressed by two members and a direction. Turning it round is
// not an edit — it is a different event — so those three fields are refused on
// update rather than quietly ignored, and the client deletes and recreates.
const DIRECTION_FIELDS = ['fromMemberId', 'toMemberId', 'groupId'];

const problem = (code, message) => ({ error: { code, message } });

const badRequest = (res, issue) =>
    res.status(400).json({ error: issue.error.message, code: issue.error.code });

// Thrown from inside the transaction so the balance check and the insert are
// one decision. respondToGroupError already knows how to answer these.
const conflict = (code, message) => new GroupAccessError({ status: 409, code, message });

const notFound = () =>
    new GroupAccessError({
        status: 404,
        code: 'SETTLEMENT_NOT_FOUND',
        message: 'Settlement not found',
    });

const toSettlement = (settlement, memberById) => ({
    id: settlement.id,
    groupId: settlement.groupId,
    fromMember: {
        id: settlement.fromMemberId,
        name: memberById.get(settlement.fromMemberId)?.name ?? null,
    },
    toMember: {
        id: settlement.toMemberId,
        name: memberById.get(settlement.toMemberId)?.name ?? null,
    },
    amount: Number(settlement.amount),
    date: settlement.date,
    method: settlement.method,
    note: settlement.note,
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
});

const indexMembers = (members) => new Map(members.map((member) => [member.id, member]));

// Everything about the body that can be judged without reading the ledger.
const parseBody = (body, { partial = false } = {}) => {
    const data = {};

    if (body?.amount !== undefined || !partial) {
        let centavos;
        try {
            centavos = toCentavos(body?.amount);
        } catch (error) {
            return problem('INVALID_SETTLEMENT_AMOUNT', error.message);
        }
        if (centavos <= 0) {
            return problem('INVALID_SETTLEMENT_AMOUNT', 'A repayment must be more than zero');
        }
        data.amountCentavos = centavos;
    }

    if (body?.date !== undefined) {
        const date = new Date(body.date);
        if (Number.isNaN(date.getTime())) {
            return problem('INVALID_SETTLEMENT_DATE', 'Invalid date');
        }
        data.date = date;
    } else if (!partial) {
        data.date = new Date();
    }

    if (body?.method !== undefined) {
        const method = optionalText(body.method, { label: 'Method', max: MAX_METHOD });
        if (method.error) {
            return method;
        }
        data.method = method.value;
    }

    if (body?.note !== undefined) {
        const note = optionalText(body.note, { label: 'Note', max: MAX_NOTE });
        if (note.error) {
            return note;
        }
        data.note = note.value;
    }

    return { value: data };
};

// The whole overpayment rule, in one place so create and update cannot come to
// different conclusions.
//
// A repayment only makes sense in the direction a debt already runs, and only
// up to what is actually owed. Letting somebody hand over more than that would
// silently open a debt the other way, which is not what anybody pressing
// "settle up" means — and it is far more often a typo than a gift.
const assertSettleable = async (tx, { groupId, fromMemberId, toMemberId, amountCentavos, excludeSettlementId }) => {
    const owed = await directedPairBalanceCentavos(tx, groupId, fromMemberId, toMemberId, {
        excludeSettlementId,
    });

    if (owed <= 0) {
        throw conflict('NO_BALANCE_TO_SETTLE', 'There is nothing owed in that direction.');
    }

    if (amountCentavos > owed) {
        throw conflict(
            'SETTLEMENT_EXCEEDS_BALANCE',
            `That is more than is owed. The most that can be repaid here is ${fromCentavos(owed)}.`
        );
    }
};

// Serializable, deliberately. The balance is read and then written against
// inside the same transaction, which is the textbook shape of a read-modify-
// write race: two repayments arriving together would both measure themselves
// against the same debt and both be allowed, between them overpaying it.
// Serializable is what makes PostgreSQL notice and abort one of them.
//
// The abort surfaces as P2034, which is a retry, not a fault — so it is
// answered as one rather than as a 500.
const SERIALIZABLE = { isolationLevel: 'Serializable' };
const isWriteConflict = (error) => error?.code === 'P2034';

const withSerializable = async (work) => {
    try {
        return await prisma.$transaction(work, SERIALIZABLE);
    } catch (error) {
        if (isWriteConflict(error)) {
            throw conflict(
                'SETTLEMENT_CONFLICT',
                'Someone recorded a repayment at the same moment. Try again.'
            );
        }
        throw error;
    }
};

const getBalances = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        // Readable while archived: a finished trip is exactly when somebody
        // wants to check what it came to.
        const group = await requireOwnedGroup(req.user.id, req.params.groupId);

        res.json(await groupBalanceView(prisma, group));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to work out the balances');
    }
};

const listSettlements = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireOwnedGroup(req.user.id, req.params.groupId);

        const [settlements, members] = await Promise.all([
            prisma.settlement.findMany({
                where: { groupId: group.id },
                // Newest first, with createdAt breaking ties so two repayments
                // dated the same day keep a stable order between requests.
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            }),
            prisma.groupMember.findMany({ where: { groupId: group.id } }),
        ]);

        const memberById = indexMembers(members);
        res.json(settlements.map((settlement) => toSettlement(settlement, memberById)));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch repayments');
    }
};

const getSettlement = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.settlementId, 'settlement');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireOwnedGroup(req.user.id, req.params.groupId);

        // Never by settlement id alone. The group is resolved first and the
        // row matched against it, so an id from another account's group is not
        // found rather than found and then refused.
        const settlement = await prisma.settlement.findFirst({
            where: { id: req.params.settlementId, groupId: group.id },
        });

        if (!settlement) {
            throw notFound();
        }

        const members = await prisma.groupMember.findMany({ where: { groupId: group.id } });
        res.json(toSettlement(settlement, indexMembers(members)));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch that repayment');
    }
};

const createSettlement = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    const fromId = req.body?.fromMemberId;
    const toId = req.body?.toMemberId;

    if (typeof fromId !== 'string' || fromId.trim() === '') {
        return badRequest(res, problem('FROM_MEMBER_REQUIRED', 'Who paid is required'));
    }
    if (typeof toId !== 'string' || toId.trim() === '') {
        return badRequest(res, problem('TO_MEMBER_REQUIRED', 'Who was paid is required'));
    }
    if (fromId === toId) {
        return badRequest(
            res,
            problem('SAME_SETTLEMENT_MEMBER', 'A repayment needs two different people')
        );
    }

    const parsed = parseBody(req.body);
    if (parsed.error) {
        return badRequest(res, parsed);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId, {
            include: { members: true },
        });

        const memberById = indexMembers(group.members);
        const from = memberById.get(fromId);
        const to = memberById.get(toId);

        // Checked against this group's own members, so an id from another
        // group — or another account — is simply not in the list.
        if (!from) {
            return badRequest(
                res,
                problem('FROM_MEMBER_NOT_IN_GROUP', 'That payer is not a member of this group')
            );
        }
        if (!to) {
            return badRequest(
                res,
                problem('TO_MEMBER_NOT_IN_GROUP', 'That recipient is not a member of this group')
            );
        }
        if (from.archivedAt) {
            return badRequest(
                res,
                problem('FROM_MEMBER_ARCHIVED', `${from.name} has been archived in this group`)
            );
        }
        if (to.archivedAt) {
            return badRequest(
                res,
                problem('TO_MEMBER_ARCHIVED', `${to.name} has been archived in this group`)
            );
        }

        const created = await withSerializable(async (tx) => {
            await assertSettleable(tx, {
                groupId: group.id,
                fromMemberId: from.id,
                toMemberId: to.id,
                amountCentavos: parsed.value.amountCentavos,
            });

            return tx.settlement.create({
                data: {
                    groupId: group.id,
                    fromMemberId: from.id,
                    toMemberId: to.id,
                    amount: fromCentavos(parsed.value.amountCentavos),
                    date: parsed.value.date,
                    method: parsed.value.method ?? null,
                    note: parsed.value.note ?? null,
                },
            });
        });

        res.status(201).json(toSettlement(created, memberById));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to record that repayment');
    }
};

const updateSettlement = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.settlementId, 'settlement');
    if (badId) {
        return badRequest(res, badId);
    }

    // Checked before the generic guard, which would otherwise catch groupId
    // first and answer with a sentence that says what is refused but not what
    // to do instead. All three of these mean the same thing — this is a
    // different event, not an edit — so all three say so.
    const direction = DIRECTION_FIELDS.find((field) =>
        Object.prototype.hasOwnProperty.call(req.body ?? {}, field)
    );
    if (direction) {
        return badRequest(
            res,
            problem(
                'READ_ONLY_FIELD',
                `${direction} cannot be changed. Delete this repayment and record a new one.`
            )
        );
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    const parsed = parseBody(req.body, { partial: true });
    if (parsed.error) {
        return badRequest(res, parsed);
    }

    if (Object.keys(parsed.value).length === 0) {
        return res.status(400).json({ error: 'No fields to update', code: 'NO_FIELDS' });
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId, {
            include: { members: true },
        });

        const existing = await prisma.settlement.findFirst({
            where: { id: req.params.settlementId, groupId: group.id },
        });

        if (!existing) {
            throw notFound();
        }

        // Deliberately no archived-member check here. A member archived after
        // the fact was still part of what happened, and refusing to correct a
        // mistyped amount because somebody has since left the group would make
        // the history less accurate rather than more. New repayments still
        // cannot name an archived member.
        const updated = await withSerializable(async (tx) => {
            if (parsed.value.amountCentavos !== undefined) {
                await assertSettleable(tx, {
                    groupId: group.id,
                    fromMemberId: existing.fromMemberId,
                    toMemberId: existing.toMemberId,
                    amountCentavos: parsed.value.amountCentavos,
                    // Without this the row being replaced is counted twice:
                    // raising ₱40 to ₱60 would be measured against a debt that
                    // already has the ₱40 taken off it, and refused.
                    excludeSettlementId: existing.id,
                });
            }

            const data = {};
            if (parsed.value.amountCentavos !== undefined) {
                data.amount = fromCentavos(parsed.value.amountCentavos);
            }
            if (parsed.value.date !== undefined) {
                data.date = parsed.value.date;
            }
            if (parsed.value.method !== undefined) {
                data.method = parsed.value.method;
            }
            if (parsed.value.note !== undefined) {
                data.note = parsed.value.note;
            }

            return tx.settlement.update({ where: { id: existing.id }, data });
        });

        res.json(toSettlement(updated, indexMembers(group.members)));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to update that repayment');
    }
};

// Removes the repayment and nothing else. The debt it covered reopens on its
// own, because every balance in this feature is derived from the rows rather
// than stored beside them — there is no total anywhere to put back.
const deleteSettlement = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.settlementId, 'settlement');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId);

        const { count } = await prisma.settlement.deleteMany({
            where: { id: req.params.settlementId, groupId: group.id },
        });

        if (count === 0) {
            throw notFound();
        }

        res.json({ deleted: true });
    } catch (error) {
        respondToGroupError(error, res, 'Failed to delete that repayment');
    }
};

module.exports = {
    getBalances,
    listSettlements,
    getSettlement,
    createSettlement,
    updateSettlement,
    deleteSettlement,
    toSettlement,
};
