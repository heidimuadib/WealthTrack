import { queryKeys } from '../queryKeys';

// React Query matches a key by prefix, so the shape of these arrays is the
// whole invalidation design. These pin it.

const isPrefixOf = (prefix, key) =>
    prefix.every((segment, index) => Object.is(segment, key[index]));

const GROUP = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('group query keys', () => {
    it('are flat arrays of primitives', () => {
        // An object in a key is matched by value, and two objects written with
        // their fields in a different order are two cache entries for one set
        // of data.
        const keys = [
            queryKeys.groups.all,
            queryKeys.groups.lists(),
            queryKeys.groups.list(false),
            queryKeys.groups.details(),
            queryKeys.groups.detail(GROUP),
            queryKeys.groups.expenses(GROUP),
            queryKeys.groups.balances(GROUP),
            queryKeys.groups.settlements(GROUP),
        ];

        keys.forEach((key) => {
            expect(Array.isArray(key)).toBe(true);
            key.forEach((segment) => expect(typeof segment).not.toBe('object'));
        });
    });

    it('are stable across calls', () => {
        expect(queryKeys.groups.detail(GROUP)).toEqual(queryKeys.groups.detail(GROUP));
        expect(queryKeys.groups.list(true)).toEqual(queryKeys.groups.list(true));
    });

    it('keep the active and archived lists apart', () => {
        expect(queryKeys.groups.list(false)).not.toEqual(queryKeys.groups.list(true));
        // ...but both sit under one prefix, so archiving refreshes each.
        [false, true].forEach((archived) =>
            expect(isPrefixOf(queryKeys.groups.lists(), queryKeys.groups.list(archived))).toBe(true)
        );
    });

    it('defaults the list to active', () => {
        expect(queryKeys.groups.list()).toEqual(queryKeys.groups.list(false));
    });

    it('nest a group’s children under its detail key', () => {
        const detail = queryKeys.groups.detail(GROUP);

        [
            queryKeys.groups.expenses(GROUP),
            queryKeys.groups.balances(GROUP),
            queryKeys.groups.settlements(GROUP),
        ].forEach((child) => expect(isPrefixOf(detail, child)).toBe(true));
    });

    it('do not let one group’s prefix reach another’s', () => {
        const detail = queryKeys.groups.detail(GROUP);

        [
            queryKeys.groups.detail(OTHER),
            queryKeys.groups.expenses(OTHER),
            queryKeys.groups.balances(OTHER),
        ].forEach((other) => expect(isPrefixOf(detail, other)).toBe(false));
    });

    it('keep lists and details from invalidating each other', () => {
        expect(isPrefixOf(queryKeys.groups.lists(), queryKeys.groups.detail(GROUP))).toBe(false);
        expect(isPrefixOf(queryKeys.groups.details(), queryKeys.groups.list(false))).toBe(false);
    });

    it('do not collide with the existing expense or report keys', () => {
        // ['groups', ...] must never be a prefix of ['expenses', ...], or a
        // group write would drag the user's whole month of spending with it.
        expect(isPrefixOf(queryKeys.groups.all, queryKeys.expenses.all)).toBe(false);
        expect(isPrefixOf(queryKeys.expenses.all, queryKeys.groups.all)).toBe(false);
        expect(isPrefixOf(queryKeys.reports.all, queryKeys.groups.all)).toBe(false);

        expect(
            isPrefixOf(queryKeys.groups.all, queryKeys.expenses.month({ month: 8, year: 2026 }))
        ).toBe(false);
    });

    it('leave every pre-existing key untouched', () => {
        expect(queryKeys.expenses.all).toEqual(['expenses']);
        expect(queryKeys.expenses.month({ month: 8, year: 2026 })).toEqual(['expenses', 2026, 8]);
        expect(queryKeys.budget.all).toEqual(['budget']);
        expect(queryKeys.categories.all).toEqual(['categories']);
        expect(queryKeys.reports.all).toEqual(['reports']);
        expect(queryKeys.reports.year(2026)).toEqual(['reports', 2026]);
    });
});
