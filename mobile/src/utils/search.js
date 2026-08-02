import { formatCurrency, formatMonthYear } from './format';

// One small ranking pass over data the app already has. No index, no fuzzy
// matching library, no backend endpoint — the searchable set is a handful of
// months of expenses and a list of categories, which is small enough that
// exact, predictable substring matching beats anything cleverer. A search that
// sometimes finds things is worse than one that always finds the same things.

// Accents stripped so "Dining" and "Díning" behave the same, which matters
// less in English than it will the moment somebody types with a Spanish
// keyboard layout.
export const normalize = (text) =>
    String(text ?? '')
        .normalize('NFD')
        // Escaped rather than written literally: the combining-mark range is
        // invisible in a source file, and an editor that helpfully normalises
        // it would silently turn this into a regex that matches nothing.
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

// The order the spec asks for, as numbers so a sort can use them directly.
// Lower is better.
export const RANK = {
    EXACT: 0,
    STARTS_WITH: 1,
    CATEGORY: 2,
    CONTAINS: 3,
    SHORTCUT: 4,
};

// Everything about an expense that a person might reasonably type. Note first,
// because that is what they wrote themselves.
//
// The id is deliberately absent, and stays absent: a database key is not
// something anyone searches for, and matching one would let a number typed for
// an amount pull up an unrelated row.
const expenseHaystack = (expense) => {
    const date = expense.date ? new Date(expense.date) : null;
    const monthLabel =
        date && !Number.isNaN(date.getTime())
            ? formatMonthYear(date.getMonth() + 1, date.getFullYear())
            : '';

    return {
        note: normalize(expense.notes),
        category: normalize(expense.category?.name),
        month: normalize(monthLabel),
        // Both spellings of the figure: what is on screen, and what was typed
        // to enter it.
        amount: `${normalize(formatCurrency(expense.amount))} ${normalize(expense.amount)}`,
    };
};

export const rankExpense = (expense, needle) => {
    if (!needle) {
        return null;
    }

    const { note, category, month, amount } = expenseHaystack(expense);

    if (note && note === needle) {
        return RANK.EXACT;
    }

    if (note && note.startsWith(needle)) {
        return RANK.STARTS_WITH;
    }

    if (category && category.includes(needle)) {
        return RANK.CATEGORY;
    }

    if (note && note.includes(needle)) {
        return RANK.CONTAINS;
    }

    // Month names come from the active language, so "Agosto" finds August
    // expenses for somebody reading in Filipino without any extra wiring.
    if (month.includes(needle)) {
        return RANK.CONTAINS;
    }

    if (amount.includes(needle)) {
        return RANK.CONTAINS;
    }

    return null;
};

const byDateNewestFirst = (a, b) => new Date(b.date) - new Date(a.date);

export const searchExpenses = (expenses = [], query = '') => {
    const needle = normalize(query);

    // An empty query is not a search for everything. Before typing, the screen
    // shows what the app can do, not every row it happens to hold.
    if (!needle) {
        return [];
    }

    return expenses
        .map((expense) => ({ expense, rank: rankExpense(expense, needle) }))
        .filter((entry) => entry.rank !== null)
        .sort((a, b) => a.rank - b.rank || byDateNewestFirst(a.expense, b.expense))
        .map((entry) => entry.expense);
};

export const rankCategory = (category, needle) => {
    const name = normalize(category?.name);

    if (!name || !needle) {
        return null;
    }

    if (name === needle) {
        return RANK.EXACT;
    }

    if (name.startsWith(needle)) {
        return RANK.STARTS_WITH;
    }

    return name.includes(needle) ? RANK.CATEGORY : null;
};

export const searchCategories = (categories = [], query = '') => {
    const needle = normalize(query);

    if (!needle) {
        return [];
    }

    return categories
        .map((category) => ({ category, rank: rankCategory(category, needle) }))
        .filter((entry) => entry.rank !== null)
        .sort((a, b) => a.rank - b.rank || a.category.name.localeCompare(b.category.name))
        .map((entry) => entry.category);
};

// Actions carry a translated label and a translated bag of keywords, so
// "gastos" reaches Add expense for a Filipino reader and "chart" reaches
// Reports for an English one, without either language being special-cased.
export const rankAction = (action, needle) => {
    const label = normalize(action?.label);

    if (!label || !needle) {
        return null;
    }

    if (label === needle) {
        return RANK.EXACT;
    }

    if (label.startsWith(needle)) {
        return RANK.STARTS_WITH;
    }

    if (label.includes(needle)) {
        return RANK.SHORTCUT;
    }

    // Keyword matching is prefix-only. "bud" should find the budget; "get"
    // should not, or every action would match half of what is typed.
    const keywords = normalize(action?.keywords).split(/\s+/).filter(Boolean);

    return keywords.some((keyword) => keyword.startsWith(needle)) ? RANK.SHORTCUT : null;
};

export const searchActions = (actions = [], query = '') => {
    const needle = normalize(query);

    // The one place an empty query does return something: with nothing typed,
    // the whole point of the screen is to show what it can do.
    if (!needle) {
        return actions;
    }

    return actions
        .map((action) => ({ action, rank: rankAction(action, needle) }))
        .filter((entry) => entry.rank !== null)
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.action);
};
