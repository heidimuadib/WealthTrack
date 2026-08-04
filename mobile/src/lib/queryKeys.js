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
    reports: {
        all: ['reports'],
        year: (year) => ['reports', year],
    },
    // Two branches under one root, on purpose.
    //
    // 'list' holds the active and archived lists separately, so archiving a
    // group refetches both without either one being able to serve the other's
    // cached rows. 'detail' nests a group's expenses, balances and settlements
    // beneath the group itself, which makes ['groups', 'detail', id] a prefix
    // that invalidates everything about one group and nothing about any other.
    //
    // Every key is a flat array of primitives. An object literal in a key is
    // matched by value, and two objects written with their fields in a
    // different order are two different cache entries for the same data.
    groups: {
        all: ['groups'],
        lists: () => ['groups', 'list'],
        list: (archived = false) => ['groups', 'list', archived],
        details: () => ['groups', 'detail'],
        detail: (groupId) => ['groups', 'detail', groupId],
        expenses: (groupId) => ['groups', 'detail', groupId, 'expenses'],
        balances: (groupId) => ['groups', 'detail', groupId, 'balances'],
        settlements: (groupId) => ['groups', 'detail', groupId, 'settlements'],
    },
};
