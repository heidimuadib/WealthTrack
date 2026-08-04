const { fromCentavos, toCentavos } = require('./groupMoney');

// The only code in this project allowed to write a mirrored Expense row.
//
// A group bill is not personal spending. ₱500 paid for five people is ₱100
// consumed and ₱400 lent, and the reports, the budget meter, the month totals
// and the search index all read one table to decide what the user spent. So the
// user's own share — and only their share — is materialised as an ordinary
// Expense row, which is why none of those five readers needed a single line
// changed to understand groups.
//
// One row, never one per member. The other members' shares are somebody else's
// money and belong nowhere near this user's totals.
//
// Everything about that row is derived, so it is recomputed here from scratch
// rather than patched at each call site. Create, update, participant change and
// delete all end up in this function, which means the invariant it maintains —
// Expense.amount equals the user's share, or there is no Expense at all — has
// one implementation to get right instead of four to keep in step.

// A share of nothing is not an expense. The user was on the bill but consumed
// none of it, so a ₱0.00 row would be a line in their history that says nothing
// and a rounding target in every total that reads it.
const isSpendable = (amountCentavos) => Number.isSafeInteger(amountCentavos) && amountCentavos > 0;

// `expense` must already carry its shares and its group's members. Called
// inside the caller's transaction — never on its own — because a mirror that
// survives a rolled-back bill is worse than no mirror at all.
const syncMirror = async (tx, expense, userId) => {
    const self = (expense.group?.members ?? []).find((member) => member.isCurrentUser);

    // A group without a self-member cannot happen: creation writes one in the
    // same transaction and a partial unique index stops a second. Checked
    // anyway, because everything below is derived from it.
    if (!self) {
        const error = new Error('Group has no member representing the account holder');
        error.code = 'SELF_MEMBER_MISSING';
        throw error;
    }

    const share = (expense.shares ?? []).find((row) => row.memberId === self.id);
    const shareCentavos = share ? toCentavos(share.amount) : 0;
    const shouldExist = isSpendable(shareCentavos);

    if (shouldExist) {
        const data = {
            amount: fromCentavos(shareCentavos),
            date: expense.date,
            categoryId: expense.categoryId,
            // The bill's description, so the row reads the same in the expenses
            // list as it does in the group.
            notes: expense.description,
        };

        if (expense.personalExpenseId) {
            // Updated rather than replaced, so the row keeps its id and does
            // not jump to the top of a list the user is looking at.
            await tx.expense.update({ where: { id: expense.personalExpenseId }, data });
            return expense.personalExpenseId;
        }

        const created = await tx.expense.create({ data: { ...data, userId } });

        await tx.sharedExpense.update({
            where: { id: expense.id },
            data: { personalExpenseId: created.id },
        });

        return created.id;
    }

    if (expense.personalExpenseId) {
        // The link has to go first. personalExpenseId is declared
        // onDelete: Restrict precisely so that nothing can delete a mirrored
        // row out from under its bill, and that guard applies here too.
        await tx.sharedExpense.update({
            where: { id: expense.id },
            data: { personalExpenseId: null },
        });
        await tx.expense.delete({ where: { id: expense.personalExpenseId } });
    }

    return null;
};

// Deleting the bill itself. Same ordering problem, one step further: the shares
// go, then the bill, and only then the mirrored row it was holding in place.
const deleteWithMirror = async (tx, expense) => {
    await tx.sharedExpenseShare.deleteMany({ where: { sharedExpenseId: expense.id } });
    await tx.sharedExpense.deleteMany({ where: { id: expense.id } });

    if (expense.personalExpenseId) {
        await tx.expense.delete({ where: { id: expense.personalExpenseId } });
    }
};

module.exports = { syncMirror, deleteWithMirror, isSpendable };
