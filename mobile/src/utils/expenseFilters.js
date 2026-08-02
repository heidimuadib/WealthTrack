// Filtering the expense list, and working out what an empty result actually
// means.
//
// Client-side, deliberately. The screen already holds the whole month in one
// cached query, so filtering it is a pass over an array that is rarely more
// than a few dozen items. Asking the server instead would mean a category in
// the query key, which means a separate cache entry per category, a request
// every time a chip is tapped, and a spinner where there is currently an
// instant answer — all to avoid work the phone does in well under a
// millisecond.

// A sentinel rather than null, so "no filter" is a value the chip row can hold
// and compare like any other rather than a special case at every call site.
export const ALL_CATEGORIES = 'all';

const matchesQuery = (expense, needle) => {
    if (needle === '') {
        return true;
    }

    // The same two fields the search has always looked at.
    const haystack = `${expense.notes || ''} ${expense.category?.name || ''}`;
    return haystack.toLowerCase().includes(needle);
};

const matchesCategory = (expense, categoryId) => {
    if (categoryId === ALL_CATEGORIES) {
        return true;
    }

    return (expense.category?.id ?? expense.categoryId) === categoryId;
};

// AND, not OR. Narrowing to a category and then typing should search within
// that category — anything else makes the two controls fight each other.
export const filterExpenses = (expenses = [], { query = '', categoryId = ALL_CATEGORIES } = {}) => {
    const needle = String(query).trim().toLowerCase();

    if (needle === '' && categoryId === ALL_CATEGORIES) {
        // Same reference back when nothing is filtered, so the memo chain
        // downstream is not invalidated by a fresh array every render.
        return expenses;
    }

    return expenses.filter(
        (expense) => matchesQuery(expense, needle) && matchesCategory(expense, categoryId)
    );
};

// Which of the four empty screens to show. They are genuinely different
// situations and the useful next step differs for each: a month with nothing
// in it wants an expense adding, while a month full of expenses hidden behind
// a filter wants the filter taken off. Offering "add your first expense" to
// someone who has forty of them is the app not knowing what is going on.
export const EMPTY_MONTH = 'month';
export const EMPTY_SEARCH = 'search';
export const EMPTY_CATEGORY = 'category';
export const EMPTY_BOTH = 'both';

export const emptyKind = ({ monthCount = 0, query = '', categoryId = ALL_CATEGORIES } = {}) => {
    const searching = String(query).trim() !== '';
    const filtering = categoryId !== ALL_CATEGORIES;

    // Nothing to hide means nothing is hidden, whatever the controls say.
    if (monthCount === 0) {
        return EMPTY_MONTH;
    }

    if (searching && filtering) {
        return EMPTY_BOTH;
    }

    if (searching) {
        return EMPTY_SEARCH;
    }

    if (filtering) {
        return EMPTY_CATEGORY;
    }

    // Expenses exist, no filter is on, and yet nothing matched — not reachable
    // from the screen, but the month state is the honest answer if it happens.
    return EMPTY_MONTH;
};

// A category can be deleted from the Categories screen while it is selected
// here. Falling back keeps the list from silently showing nothing forever.
export const resolveSelectedCategory = (categoryId, categories) => {
    if (categoryId === ALL_CATEGORIES) {
        return ALL_CATEGORIES;
    }

    // Undefined means the categories have not loaded yet, which is not the
    // same as the category being gone — resetting then would drop a filter the
    // user set before the request came back.
    if (categories === undefined) {
        return categoryId;
    }

    return categories.some((category) => category.id === categoryId)
        ? categoryId
        : ALL_CATEGORIES;
};
