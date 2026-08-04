// Some rows in the expenses list are not the user's own bookkeeping. When a
// group bill includes them, the server writes their share here so that reports,
// budgets and month totals keep one definition of personal spending — and those
// rows belong to the group ledger, not to the ordinary expense editor.
//
// The server says which is which, on every row: `sharedExpense` is null for an
// ordinary expense and carries two ids for a share of a group bill. Nothing
// here guesses from a description, a note, a category or an amount, because a
// ₱100 mirror and a ₱100 lunch are indistinguishable by any of those, and being
// wrong means either a broken editor or a corrupted ledger.

export const isSharedMirror = (expense) => Boolean(expense?.sharedExpense?.id);

// Where tapping an expense should go, as [routeName, params] ready to spread
// into navigate(). Kept in one function so the expenses list, the dashboard's
// recent rows and the search results cannot drift into disagreeing about it —
// a screen that forgot would open the ordinary editor on a mirrored row.
//
// The ids sent are the group's and the group expense's. The mirror's own id
// stays where it belongs: it is a derived row, and a client that could name it
// is a client that could ask the server to change it.
export const expenseRoute = (expense) => {
    if (isSharedMirror(expense)) {
        return [
            'SharedExpenseDetail',
            {
                groupId: expense.sharedExpense.groupId,
                sharedExpenseId: expense.sharedExpense.id,
            },
        ];
    }

    return ['EditExpense', { expense }];
};

// What a screen reader should hear on a mirrored row, appended to whatever the
// row already reads. Without it the row announces as an ordinary expense whose
// edit action silently does something else.
export const sharedExpenseHint = (t) => t('expenses.sharedA11y');
