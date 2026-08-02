import {
    ALL_CATEGORIES,
    filterExpenses,
    emptyKind,
    resolveSelectedCategory,
    EMPTY_MONTH,
    EMPTY_SEARCH,
    EMPTY_CATEGORY,
    EMPTY_BOTH,
} from '../expenseFilters';

const FOOD = { id: 1, name: 'Food & Dining' };
const TRANSPORT = { id: 2, name: 'Transport' };

const EXPENSES = [
    { id: 10, amount: 250, notes: 'lunch with the team', category: FOOD },
    { id: 11, amount: 60, notes: 'jeepney', category: TRANSPORT },
    { id: 12, amount: 900, notes: null, category: FOOD },
    // Rows can carry the id without the object, depending on where they came
    // from — the filter has to cope with both shapes.
    { id: 13, amount: 40, notes: 'tricycle', categoryId: 2 },
];

describe('filterExpenses — no filter at all', () => {
    it('returns everything', () => {
        expect(filterExpenses(EXPENSES, {})).toHaveLength(4);
    });

    it('hands back the same array, so downstream memos are not invalidated', () => {
        // A fresh array every render would recompute the day grouping and the
        // month total for nothing.
        expect(filterExpenses(EXPENSES, { query: '', categoryId: ALL_CATEGORIES })).toBe(EXPENSES);
    });

    it('copes with being called with nothing', () => {
        expect(filterExpenses()).toEqual([]);
        expect(filterExpenses(EXPENSES)).toBe(EXPENSES);
    });
});

describe('filterExpenses — by category', () => {
    it('keeps only that category', () => {
        expect(filterExpenses(EXPENSES, { categoryId: 1 }).map((e) => e.id)).toEqual([10, 12]);
    });

    it('matches a row that carries the id rather than the object', () => {
        expect(filterExpenses(EXPENSES, { categoryId: 2 }).map((e) => e.id)).toEqual([11, 13]);
    });

    it('returns nothing for a category with no expenses', () => {
        expect(filterExpenses(EXPENSES, { categoryId: 99 })).toEqual([]);
    });
});

describe('filterExpenses — by search', () => {
    it('looks at notes and category name', () => {
        expect(filterExpenses(EXPENSES, { query: 'lunch' }).map((e) => e.id)).toEqual([10]);
        expect(filterExpenses(EXPENSES, { query: 'transport' }).map((e) => e.id)).toEqual([11]);
    });

    it('ignores case and surrounding spaces', () => {
        expect(filterExpenses(EXPENSES, { query: '  LUNCH ' }).map((e) => e.id)).toEqual([10]);
    });

    it('survives a row with no notes', () => {
        expect(() => filterExpenses(EXPENSES, { query: 'x' })).not.toThrow();
    });
});

describe('filterExpenses — the two together', () => {
    it('requires both, not either', () => {
        // Narrowing to a category and then typing should search inside it.
        // OR logic would widen the list as the user tried to narrow it.
        expect(filterExpenses(EXPENSES, { query: 'lunch', categoryId: 1 }).map((e) => e.id)).toEqual(
            [10]
        );
        expect(filterExpenses(EXPENSES, { query: 'lunch', categoryId: 2 })).toEqual([]);
    });

    it('clearing one keeps the other working', () => {
        expect(filterExpenses(EXPENSES, { query: '', categoryId: 1 })).toHaveLength(2);
        expect(filterExpenses(EXPENSES, { query: 'jeepney', categoryId: ALL_CATEGORIES })).toHaveLength(1);
    });
});

describe('emptyKind', () => {
    it('calls a month with nothing in it empty, whatever the controls say', () => {
        // Nothing to hide means nothing is hidden.
        expect(emptyKind({ monthCount: 0, query: 'lunch', categoryId: 1 })).toBe(EMPTY_MONTH);
        expect(emptyKind({ monthCount: 0 })).toBe(EMPTY_MONTH);
    });

    it('distinguishes a search miss from an empty month', () => {
        // This is what stops "add your first expense" appearing to somebody
        // who has forty of them.
        expect(emptyKind({ monthCount: 40, query: 'lunch' })).toBe(EMPTY_SEARCH);
    });

    it('distinguishes a category miss', () => {
        expect(emptyKind({ monthCount: 40, categoryId: 7 })).toBe(EMPTY_CATEGORY);
    });

    it('distinguishes both at once', () => {
        expect(emptyKind({ monthCount: 40, query: 'lunch', categoryId: 7 })).toBe(EMPTY_BOTH);
    });

    it('treats whitespace as no search', () => {
        expect(emptyKind({ monthCount: 40, query: '   ', categoryId: 7 })).toBe(EMPTY_CATEGORY);
    });

    it('copes with being called with nothing', () => {
        expect(emptyKind()).toBe(EMPTY_MONTH);
    });
});

describe('resolveSelectedCategory', () => {
    const categories = [FOOD, TRANSPORT];

    it('keeps a category that still exists', () => {
        expect(resolveSelectedCategory(1, categories)).toBe(1);
    });

    it('falls back when the selected category has been deleted', () => {
        // Otherwise the list stays empty forever with no visible reason.
        expect(resolveSelectedCategory(99, categories)).toBe(ALL_CATEGORIES);
    });

    it('leaves the selection alone while categories are still loading', () => {
        // Undefined is "we have not heard back", which is not the same as
        // "that category is gone" — resetting then would drop the filter the
        // user just set.
        expect(resolveSelectedCategory(1, undefined)).toBe(1);
    });

    it('falls back when the account has no categories at all', () => {
        expect(resolveSelectedCategory(1, [])).toBe(ALL_CATEGORIES);
    });

    it('leaves All alone in every case', () => {
        expect(resolveSelectedCategory(ALL_CATEGORIES, undefined)).toBe(ALL_CATEGORIES);
        expect(resolveSelectedCategory(ALL_CATEGORIES, [])).toBe(ALL_CATEGORIES);
        expect(resolveSelectedCategory(ALL_CATEGORIES, categories)).toBe(ALL_CATEGORIES);
    });
});
