const prisma = require('../lib/prisma');
const {
    requireOwnedGroup,
    requireWritableGroup,
    respondToGroupError,
} = require('../lib/groupAccess');
const {
    validateUuidParam,
    rejectProtectedFields,
    requiredText,
    optionalText,
} = require('../lib/groupValidation');
const {
    toCentavos,
    fromCentavos,
    splitEqual,
    splitByPercentage,
    splitByShares,
    validateCustomSplit,
} = require('../lib/groupMoney');
const { syncMirror, deleteWithMirror } = require('../lib/sharedExpenseMirror');

const MAX_DESCRIPTION = 120;
const MAX_NOTE = 500;

// What the API calls a split, and what the column stores. "fixed" reads better
// to somebody typing amounts than CUSTOM does, and CUSTOM is what the enum has
// been called since the schema shipped; both are accepted rather than renaming
// a value that is already in a migration.
const SPLIT_METHODS = {
    equal: 'EQUAL',
    fixed: 'CUSTOM',
    custom: 'CUSTOM',
    percentage: 'PERCENTAGE',
    shares: 'SHARES',
};

const problem = (code, message) => ({ error: { code, message } });

const badRequest = (res, issue) =>
    res.status(400).json({ error: issue.error.message, code: issue.error.code });

// Every money error out of groupMoney.js is a sentence written for the person
// who typed the split, so it is passed through rather than replaced. The code
// is fixed, so a client can branch without matching on prose.
const isMoneyError = (error) => error?.code === 'INVALID_MONEY';

const toShare = (share) => ({
    memberId: share.memberId,
    amount: Number(share.amount),
    splitInput: share.splitInput === null || share.splitInput === undefined
        ? null
        : String(share.splitInput),
});

const toSharedExpense = (expense) => ({
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amount: Number(expense.amount),
    date: expense.date,
    note: expense.note,
    payerMemberId: expense.payerMemberId,
    splitMethod: expense.splitMethod,
    categoryId: expense.categoryId,
    // Whether this bill put anything into the user's own expense history. The
    // id itself is deliberately not exposed: the mirror is derived, and a
    // client that learned to edit it directly would be editing the ledger.
    hasPersonalShare: expense.personalExpenseId !== null,
    shares: (expense.shares ?? [])
        .slice()
        .sort((a, b) => (a.memberId < b.memberId ? -1 : 1))
        .map(toShare),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
});

// Everything the write paths need in one read: the group for ownership, its
// members to check payer and participants against, and the existing shares and
// mirror link so an edit knows what it is replacing.
const EXPENSE_INCLUDE = {
    shares: true,
    group: { include: { members: true } },
};

// Resolves the split into exact centavo amounts, whichever way the caller asked
// for it. Returns share rows ready to write, or throws a money error naming
// what did not add up.
const resolveShares = (splitMethod, totalCentavos, participants) => {
    if (splitMethod === 'EQUAL') {
        return splitEqual(
            totalCentavos,
            participants.map((entry) => entry.memberId)
        ).map((share) => ({ ...share, splitInput: null }));
    }

    if (splitMethod === 'PERCENTAGE') {
        return splitByPercentage(totalCentavos, participants);
    }

    if (splitMethod === 'SHARES') {
        return splitByShares(totalCentavos, participants);
    }

    // CUSTOM — amounts typed directly, which must already add up.
    const shares = participants.map((entry) => ({
        memberId: entry.memberId,
        amountCentavos: toCentavos(entry.amount),
    }));

    return validateCustomSplit(totalCentavos, shares).map((share) => ({
        ...share,
        splitInput: null,
    }));
};

// Everything about the request that has to be true before anything is written.
// Returns { error } for the caller to answer with, or the resolved rows.
const parseWrite = (body, group) => {
    const description = requiredText(body?.description, {
        label: 'Description',
        max: MAX_DESCRIPTION,
    });
    if (description.error) {
        return description;
    }

    const note =
        body?.note === undefined
            ? { value: null }
            : optionalText(body.note, { label: 'Note', max: MAX_NOTE });
    if (note.error) {
        return note;
    }

    let totalCentavos;
    try {
        totalCentavos = toCentavos(body?.amount);
    } catch (error) {
        return problem('INVALID_AMOUNT', error.message);
    }
    if (totalCentavos <= 0) {
        return problem('INVALID_AMOUNT', 'Amount must be greater than zero');
    }

    const date = body?.date === undefined ? new Date() : new Date(body.date);
    if (Number.isNaN(date.getTime())) {
        return problem('INVALID_DATE', 'Invalid date');
    }

    const splitMethod = SPLIT_METHODS[String(body?.splitMethod ?? 'equal').toLowerCase()];
    if (!splitMethod) {
        return problem(
            'INVALID_SPLIT_METHOD',
            'Split must be one of equal, fixed, percentage, or shares'
        );
    }

    if (typeof body?.payerMemberId !== 'string' || body.payerMemberId.trim() === '') {
        return problem('PAYER_REQUIRED', 'Somebody has to have paid for this');
    }

    const participants = Array.isArray(body?.participants) ? body.participants : null;
    if (!participants || participants.length === 0) {
        return problem('PARTICIPANTS_REQUIRED', 'At least one participant is required');
    }

    // Members are checked against the group that ownership was just proven for,
    // so an id belonging to another group — or another account — is simply not
    // in this list.
    const byId = new Map(group.members.map((member) => [member.id, member]));

    const payer = byId.get(body.payerMemberId);
    if (!payer) {
        return problem('PAYER_NOT_IN_GROUP', 'That payer is not a member of this group');
    }
    if (payer.archivedAt) {
        return problem('PAYER_ARCHIVED', 'That payer has been archived in this group');
    }

    for (const entry of participants) {
        const member = byId.get(entry?.memberId);
        if (!member) {
            return problem(
                'PARTICIPANT_NOT_IN_GROUP',
                'One of those participants is not a member of this group'
            );
        }
        if (member.archivedAt) {
            return problem(
                'PARTICIPANT_ARCHIVED',
                `${member.name} has been archived in this group`
            );
        }
    }

    let shares;
    try {
        // Duplicate participants are refused in here, by the same assertion
        // every split method shares.
        shares = resolveShares(splitMethod, totalCentavos, participants);
    } catch (error) {
        if (isMoneyError(error)) {
            return problem('INVALID_SPLIT', error.message);
        }
        throw error;
    }

    return {
        value: {
            description: description.value,
            note: note.value,
            amount: fromCentavos(totalCentavos),
            date,
            splitMethod,
            payerMemberId: payer.id,
            shares,
        },
    };
};

// The category is the user's own, and is checked the same way the ordinary
// expense endpoints check it — a category id from another account is not found.
const ownsCategory = async (categoryId, userId) => {
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return false;
    }
    const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
        select: { id: true },
    });
    return category !== null;
};

const listExpenses = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireOwnedGroup(req.user.id, req.params.groupId);

        const expenses = await prisma.sharedExpense.findMany({
            where: { groupId: group.id },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            include: { shares: true },
        });

        res.json(expenses.map(toSharedExpense));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch expenses');
    }
};

const getExpense = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.expenseId, 'expense');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireOwnedGroup(req.user.id, req.params.groupId);

        // Never by expense id alone. The group is resolved first and the
        // expense is matched against it, so an id from another account's group
        // is not found rather than found and then refused.
        const expense = await prisma.sharedExpense.findFirst({
            where: { id: req.params.expenseId, groupId: group.id },
            include: { shares: true },
        });

        if (!expense) {
            return res.status(404).json({ error: 'Expense not found', code: 'EXPENSE_NOT_FOUND' });
        }

        res.json(toSharedExpense(expense));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to fetch that expense');
    }
};

const createExpense = async (req, res) => {
    const badId = validateUuidParam(req.params.groupId, 'group');
    if (badId) {
        return badRequest(res, badId);
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId, {
            include: { members: true },
        });

        const parsed = parseWrite(req.body, group);
        if (parsed.error) {
            return badRequest(res, parsed);
        }

        if (!(await ownsCategory(req.body?.categoryId, req.user.id))) {
            return res.status(404).json({ error: 'Category not found', code: 'CATEGORY_NOT_FOUND' });
        }

        // The bill, its shares and the user's mirrored expense are one write.
        // A mirror that survived a rolled-back bill would be a number in the
        // month total with nothing behind it.
        const created = await prisma.$transaction(async (tx) => {
            const expense = await tx.sharedExpense.create({
                data: {
                    groupId: group.id,
                    description: parsed.value.description,
                    note: parsed.value.note,
                    amount: parsed.value.amount,
                    date: parsed.value.date,
                    splitMethod: parsed.value.splitMethod,
                    payerMemberId: parsed.value.payerMemberId,
                    categoryId: req.body.categoryId,
                    shares: {
                        create: parsed.value.shares.map((share) => ({
                            memberId: share.memberId,
                            amount: fromCentavos(share.amountCentavos),
                            splitInput: share.splitInput,
                        })),
                    },
                },
                include: EXPENSE_INCLUDE,
            });

            await syncMirror(tx, expense, req.user.id);

            return tx.sharedExpense.findFirst({
                where: { id: expense.id },
                include: { shares: true },
            });
        });

        res.status(201).json(toSharedExpense(created));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to record that expense');
    }
};

const updateExpense = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.expenseId, 'expense');
    if (badId) {
        return badRequest(res, badId);
    }

    const protectedField = rejectProtectedFields(req.body);
    if (protectedField) {
        return badRequest(res, protectedField);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId, {
            include: { members: true },
        });

        const existing = await prisma.sharedExpense.findFirst({
            where: { id: req.params.expenseId, groupId: group.id },
            include: EXPENSE_INCLUDE,
        });

        if (!existing) {
            return res.status(404).json({ error: 'Expense not found', code: 'EXPENSE_NOT_FOUND' });
        }

        const parsed = parseWrite(req.body, group);
        if (parsed.error) {
            return badRequest(res, parsed);
        }

        const categoryId =
            req.body?.categoryId === undefined ? existing.categoryId : req.body.categoryId;

        if (categoryId !== existing.categoryId && !(await ownsCategory(categoryId, req.user.id))) {
            return res.status(404).json({ error: 'Category not found', code: 'CATEGORY_NOT_FOUND' });
        }

        const updated = await prisma.$transaction(async (tx) => {
            // Shares are replaced rather than reconciled. Working out which of
            // them moved would be a second implementation of the split rules,
            // and the rows carry nothing worth preserving — no ids anyone
            // holds, no history of their own.
            await tx.sharedExpenseShare.deleteMany({ where: { sharedExpenseId: existing.id } });

            const expense = await tx.sharedExpense.update({
                where: { id: existing.id },
                data: {
                    description: parsed.value.description,
                    note: parsed.value.note,
                    amount: parsed.value.amount,
                    date: parsed.value.date,
                    splitMethod: parsed.value.splitMethod,
                    payerMemberId: parsed.value.payerMemberId,
                    categoryId,
                    shares: {
                        create: parsed.value.shares.map((share) => ({
                            memberId: share.memberId,
                            amount: fromCentavos(share.amountCentavos),
                            splitInput: share.splitInput,
                        })),
                    },
                },
                include: EXPENSE_INCLUDE,
            });

            // Handles all three outcomes: the share changed, the user joined
            // the bill, or the user came off it and their mirror goes.
            await syncMirror(tx, expense, req.user.id);

            return tx.sharedExpense.findFirst({
                where: { id: expense.id },
                include: { shares: true },
            });
        });

        res.json(toSharedExpense(updated));
    } catch (error) {
        respondToGroupError(error, res, 'Failed to update that expense');
    }
};

const deleteExpense = async (req, res) => {
    const badId =
        validateUuidParam(req.params.groupId, 'group') ||
        validateUuidParam(req.params.expenseId, 'expense');
    if (badId) {
        return badRequest(res, badId);
    }

    try {
        const group = await requireWritableGroup(req.user.id, req.params.groupId);

        const existing = await prisma.sharedExpense.findFirst({
            where: { id: req.params.expenseId, groupId: group.id },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Expense not found', code: 'EXPENSE_NOT_FOUND' });
        }

        await prisma.$transaction(async (tx) => {
            await deleteWithMirror(tx, existing);
        });

        res.json({ deleted: true });
    } catch (error) {
        respondToGroupError(error, res, 'Failed to delete that expense');
    }
};

module.exports = {
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
    SPLIT_METHODS,
    toSharedExpense,
};
