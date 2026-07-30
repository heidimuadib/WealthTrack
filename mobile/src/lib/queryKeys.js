// Centralised so a mutation invalidating "expenses" and a screen reading
// "expenses" cannot drift apart over a typo.
//
// Month and year are separate elements rather than an object so that the
// prefix ['expenses'] matches every month at once: adding an expense
// invalidates the whole table, while a screen still subscribes to one month.
export const queryKeys = {
    expenses: {
        all: ['expenses'],
        month: ({ month, year }) => ['expenses', year, month],
    },
    budget: {
        all: ['budget'],
        month: ({ month, year }) => ['budget', year, month],
    },
    categories: {
        all: ['categories'],
    },
};
