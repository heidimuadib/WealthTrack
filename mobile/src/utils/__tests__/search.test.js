import {
    normalize,
    rankExpense,
    searchExpenses,
    searchCategories,
    searchActions,
    RANK,
} from '../search';

const FOOD = { id: 1, name: 'Food & Dining' };
const TRANSPORT = { id: 2, name: 'Transport' };

const EXPENSES = [
    { id: 101, amount: 250, date: '2026-08-02T10:00:00Z', notes: 'lunch', category: FOOD },
    { id: 102, amount: 1250, date: '2026-08-05T10:00:00Z', notes: 'lunch with the team', category: FOOD },
    { id: 103, amount: 60, date: '2026-08-04T10:00:00Z', notes: 'jeepney', category: TRANSPORT },
    { id: 104, amount: 90, date: '2026-07-20T10:00:00Z', notes: 'team dinner', category: FOOD },
];

const ACTIONS = [
    { key: 'budget', label: 'Set budget', keywords: 'budget limit monthly plan' },
    { key: 'reports', label: 'View reports', keywords: 'reports charts yearly summary' },
    { key: 'profile', label: 'Edit profile', keywords: 'profile account name photo' },
];

const ids = (list) => list.map((item) => item.id);

describe('normalize', () => {
    it('lowercases and trims', () => {
        expect(normalize('  LUNCH  ')).toBe('lunch');
    });

    it('strips accents, so a Spanish keyboard finds the same rows', () => {
        expect(normalize('Café')).toBe('cafe');
        expect(normalize('DÍNING')).toBe('dining');
    });

    it('survives anything that is not a string', () => {
        expect(normalize(undefined)).toBe('');
        expect(normalize(null)).toBe('');
        expect(normalize(1250)).toBe('1250');
    });
});

describe('searchExpenses — matching', () => {
    it('is case-insensitive and ignores surrounding spaces', () => {
        // 101's note is exactly "lunch"; 102's merely starts with it.
        expect(ids(searchExpenses(EXPENSES, '  LUNCH '))).toEqual([101, 102]);
    });

    it('matches a note', () => {
        expect(ids(searchExpenses(EXPENSES, 'jeepney'))).toEqual([103]);
    });

    it('matches a category name', () => {
        expect(ids(searchExpenses(EXPENSES, 'transport'))).toEqual([103]);
    });

    it('matches a month name, in the language being read', () => {
        // Month names come from the active dictionary, so this is what makes
        // "Agosto" work for a Filipino reader without any extra wiring.
        expect(ids(searchExpenses(EXPENSES, 'august'))).toEqual([102, 103, 101]);
        expect(ids(searchExpenses(EXPENSES, 'july'))).toEqual([104]);
    });

    it('matches a year', () => {
        expect(searchExpenses(EXPENSES, '2026')).toHaveLength(4);
    });

    it('matches an amount, as typed and as displayed', () => {
        expect(ids(searchExpenses(EXPENSES, '1250'))).toContain(102);
        expect(ids(searchExpenses(EXPENSES, '1,250'))).toContain(102);
    });

    it('never matches a database id', () => {
        // 101–104 are ids and nothing else. A key is not something anyone
        // searches for, and matching one would let a number typed for an
        // amount pull up an unrelated row.
        [101, 102, 103, 104].forEach((id) => {
            expect(searchExpenses(EXPENSES, String(id))).toEqual([]);
        });
    });

    it('returns nothing for a query that matches nothing', () => {
        expect(searchExpenses(EXPENSES, 'helicopter')).toEqual([]);
    });

    it('returns nothing for an empty query, rather than everything', () => {
        // An empty box is not a search for the whole list.
        expect(searchExpenses(EXPENSES, '')).toEqual([]);
        expect(searchExpenses(EXPENSES, '   ')).toEqual([]);
    });

    it('copes with rows missing notes, category or date', () => {
        const rough = [{ id: 9, amount: 10, notes: null, category: null, date: null }];
        expect(() => searchExpenses(rough, 'x')).not.toThrow();
    });
});

describe('searchExpenses — ranking', () => {
    it('puts an exact note match first', () => {
        // "lunch" is exactly one note and a prefix of another.
        expect(ids(searchExpenses(EXPENSES, 'lunch'))[0]).toBe(101);
    });

    it('ranks starts-with above contains', () => {
        // "team dinner" starts with the word; "lunch with the team" only
        // contains it — so the older row outranks the newer one, which is the
        // whole point of ranking before falling back to date.
        expect(rankExpense(EXPENSES[3], 'team')).toBe(RANK.STARTS_WITH);
        expect(rankExpense(EXPENSES[1], 'team')).toBe(RANK.CONTAINS);
        expect(ids(searchExpenses(EXPENSES, 'team'))).toEqual([104, 102]);
    });

    it('ranks a category match above a note-contains match', () => {
        expect(rankExpense(EXPENSES[0], 'food')).toBe(RANK.CATEGORY);
        expect(RANK.CATEGORY).toBeLessThan(RANK.CONTAINS);
    });

    it('breaks ties by newest first', () => {
        // All three August rows match equally on the month.
        expect(ids(searchExpenses(EXPENSES, 'august'))).toEqual([102, 103, 101]);
    });
});

describe('searchCategories', () => {
    const CATEGORIES = [FOOD, TRANSPORT, { id: 3, name: 'Food delivery' }];

    it('matches by name, exact first', () => {
        expect(searchCategories(CATEGORIES, 'transport').map((c) => c.id)).toEqual([2]);
    });

    it('ranks starts-with above contains', () => {
        const found = searchCategories(CATEGORIES, 'food').map((c) => c.id);
        // Both start with "food"; neither is exact.
        expect(found).toContain(1);
        expect(found).toContain(3);
    });

    it('returns nothing for an empty query', () => {
        expect(searchCategories(CATEGORIES, '')).toEqual([]);
    });

    it('copes with a missing list', () => {
        expect(searchCategories(undefined, 'food')).toEqual([]);
    });
});

describe('searchActions', () => {
    it('returns every action for an empty query, which is the point before typing', () => {
        expect(searchActions(ACTIONS, '')).toHaveLength(3);
        expect(searchActions(ACTIONS, '   ')).toHaveLength(3);
    });

    it('matches the visible label', () => {
        expect(searchActions(ACTIONS, 'set budget').map((a) => a.key)).toEqual(['budget']);
    });

    it('matches a synonym the label does not contain', () => {
        // "limit" appears nowhere in "Set budget".
        expect(searchActions(ACTIONS, 'limit').map((a) => a.key)).toEqual(['budget']);
        expect(searchActions(ACTIONS, 'account').map((a) => a.key)).toEqual(['profile']);
        expect(searchActions(ACTIONS, 'chart').map((a) => a.key)).toEqual(['reports']);
    });

    it('matches keyword prefixes but not keyword middles', () => {
        // "bud" should find the budget; "get" should not, or half the actions
        // would match half of what is typed.
        expect(searchActions(ACTIONS, 'bud').map((a) => a.key)).toEqual(['budget']);
        expect(searchActions(ACTIONS, 'onthly')).toEqual([]);
    });

    it('puts a label match above a keyword match', () => {
        const withOverlap = [
            { key: 'a', label: 'Something else', keywords: 'report' },
            { key: 'b', label: 'Reports', keywords: 'x' },
        ];
        expect(searchActions(withOverlap, 'report').map((a) => a.key)).toEqual(['b', 'a']);
    });
});
