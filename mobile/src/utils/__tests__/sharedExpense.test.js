import { isSharedMirror, expenseRoute } from '../sharedExpense';

const ordinary = {
    id: 41,
    amount: 100,
    notes: 'Lunch',
    category: { id: 7, name: 'Food' },
    sharedExpense: null,
};

const mirror = {
    id: 42,
    amount: 100,
    notes: 'Restaurant',
    category: { id: 7, name: 'Food' },
    sharedExpense: {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        groupId: 'bbbbbbbb-0000-4000-8000-000000000002',
    },
};

describe('isSharedMirror', () => {
    it('reads the server’s answer and nothing else', () => {
        expect(isSharedMirror(mirror)).toBe(true);
        expect(isSharedMirror(ordinary)).toBe(false);
    });

    it('treats a missing field as ordinary', () => {
        // Older cached rows, and the create/update responses, carry no
        // sharedExpense key at all. Absent must read the same as null.
        expect(isSharedMirror({ id: 1, amount: 5 })).toBe(false);
        expect(isSharedMirror(undefined)).toBe(false);
        expect(isSharedMirror(null)).toBe(false);
    });

    it('never guesses from the row’s own contents', () => {
        // A ₱100 mirror and a ₱100 lunch are indistinguishable by amount,
        // note or category, which is exactly why none of them is consulted.
        const lookalike = { ...ordinary, amount: mirror.amount, notes: mirror.notes };
        expect(isSharedMirror(lookalike)).toBe(false);
    });
});

describe('expenseRoute', () => {
    it('sends an ordinary expense to the normal editor', () => {
        expect(expenseRoute(ordinary)).toEqual(['EditExpense', { expense: ordinary }]);
    });

    it('sends a mirror to the group expense behind it', () => {
        expect(expenseRoute(mirror)).toEqual([
            'SharedExpenseDetail',
            {
                groupId: 'bbbbbbbb-0000-4000-8000-000000000002',
                sharedExpenseId: 'aaaaaaaa-0000-4000-8000-000000000001',
            },
        ]);
    });

    it('never passes the mirror’s own id as the shared expense id', () => {
        const [, params] = expenseRoute(mirror);

        expect(params.sharedExpenseId).not.toBe(mirror.id);
        expect(params.sharedExpenseId).toBe(mirror.sharedExpense.id);
        // The personal row's id is derived and server-owned; a client that
        // could name it is a client that could ask for it to be changed.
        expect(Object.values(params)).not.toContain(mirror.id);
    });

    it('carries only ids, never anything from the ledger', () => {
        const [, params] = expenseRoute(mirror);
        const serialised = JSON.stringify(params);

        ['Restaurant', 'Food', '100'].forEach((leak) =>
            expect(serialised).not.toContain(leak)
        );
    });

    it('returns a shape ready to spread into navigate()', () => {
        const [route, params] = expenseRoute(ordinary);
        expect(typeof route).toBe('string');
        expect(typeof params).toBe('object');
    });
});
