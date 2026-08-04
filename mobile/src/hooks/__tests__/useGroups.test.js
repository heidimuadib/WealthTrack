import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../services/groups', () => {
    const ok = () => jest.fn(() => Promise.resolve({ data: {} }));
    const service = (...names) => Object.fromEntries(names.map((name) => [name, ok()]));

    return {
        groupService: service('list', 'get', 'create', 'update', 'remove', 'archive', 'unarchive'),
        groupMemberService: service('create', 'update', 'remove', 'archive', 'unarchive'),
        sharedExpenseService: service('list', 'get', 'create', 'update', 'remove'),
        groupBalanceService: service('get'),
        settlementService: service('list', 'get', 'create', 'update', 'remove'),
    };
});

import * as hooks from '../useGroups';
import { queryKeys } from '../../lib/queryKeys';

const GROUP = 'aaaaaaaa-0000-4000-8000-000000000001';

let client;
let invalidated;
let cleared;
let mounted = [];

// Renders a hook and hands back its result, refreshed on every render.
const renderHook = (useHook) => {
    const box = { current: null };
    const Probe = () => {
        box.current = useHook();
        return null;
    };

    let tree;
    act(() => {
        tree = renderer.create(
            <QueryClientProvider client={client}>
                <Probe />
            </QueryClientProvider>
        );
    });
    mounted.push(tree);
    return box;
};

// Every key the mutation asked React Query to refresh, flattened for matching.
const invalidatedKeys = () => invalidated.map((call) => call.queryKey);

const sawExactly = (expected) => {
    const actual = invalidatedKeys();
    expect(actual).toHaveLength(expected.length);
    expected.forEach((key) => expect(actual).toContainEqual(key));
};

beforeEach(() => {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidated = [];
    cleared = 0;

    jest.spyOn(client, 'invalidateQueries').mockImplementation((args) => {
        invalidated.push(args);
        return Promise.resolve();
    });
    jest.spyOn(client, 'clear').mockImplementation(() => {
        cleared += 1;
    });
});

afterEach(() => {
    act(() => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
    jest.restoreAllMocks();
});

const run = async (box, variables) => {
    await act(async () => {
        await box.current.mutateAsync(variables);
    });
};

describe('group writes', () => {
    it('creating refreshes only the group lists', async () => {
        await run(renderHook(hooks.useCreateGroup), { name: 'Cebu' });
        sawExactly([queryKeys.groups.lists()]);
    });

    it('updating refreshes the group and the lists that show its name', async () => {
        await run(renderHook(hooks.useUpdateGroup), { groupId: GROUP, name: 'Bohol' });
        sawExactly([queryKeys.groups.detail(GROUP), queryKeys.groups.lists()]);
    });

    it.each([
        ['archive', () => hooks.useArchiveGroup()],
        ['unarchive', () => hooks.useUnarchiveGroup()],
        ['delete', () => hooks.useDeleteGroup()],
    ])('%s refreshes the group and both lists', async (_label, useHook) => {
        await run(renderHook(useHook), GROUP);
        // Both lists, because archiving moves a group from one to the other.
        sawExactly([queryKeys.groups.detail(GROUP), queryKeys.groups.lists()]);
    });
});

describe('member writes', () => {
    it.each([
        ['add', () => hooks.useAddMember(), { groupId: GROUP, name: 'John' }],
        ['rename', () => hooks.useUpdateMember(), { groupId: GROUP, memberId: 'm', name: 'J' }],
        ['archive', () => hooks.useArchiveMember(), { groupId: GROUP, memberId: 'm' }],
        ['unarchive', () => hooks.useUnarchiveMember(), { groupId: GROUP, memberId: 'm' }],
        ['delete', () => hooks.useDeleteMember(), { groupId: GROUP, memberId: 'm' }],
    ])('%s refreshes the group and the lists', async (_label, useHook, variables) => {
        await run(renderHook(useHook), variables);
        sawExactly([queryKeys.groups.detail(GROUP), queryKeys.groups.lists()]);
    });

    it('never touches personal spending', async () => {
        await run(renderHook(hooks.useAddMember), { groupId: GROUP, name: 'John' });

        // Adding somebody to a group changes no expense of the user's own.
        expect(invalidatedKeys()).not.toContainEqual(queryKeys.expenses.all);
        expect(invalidatedKeys()).not.toContainEqual(queryKeys.reports.all);
    });
});

describe('shared expense writes', () => {
    it.each([
        ['create', () => hooks.useCreateSharedExpense(), { groupId: GROUP }],
        ['update', () => hooks.useUpdateSharedExpense(), { groupId: GROUP, expenseId: 'e' }],
        ['delete', () => hooks.useDeleteSharedExpense(), { groupId: GROUP, expenseId: 'e' }],
    ])('%s reaches the group and the user’s own spending', async (_label, useHook, variables) => {
        await run(renderHook(useHook), variables);

        // The server mirrors the user's share into their expense table, so the
        // month totals and the reports move with it. These are the same two
        // prefixes the ordinary expense mutations already invalidate.
        sawExactly([
            queryKeys.groups.detail(GROUP),
            queryKeys.expenses.all,
            queryKeys.reports.all,
        ]);
    });

    it('reaches a group’s expenses and balances through the detail prefix', async () => {
        await run(renderHook(hooks.useCreateSharedExpense), { groupId: GROUP });

        const detail = queryKeys.groups.detail(GROUP);
        const covers = (child) => child.slice(0, detail.length).every((s, i) => s === detail[i]);

        expect(covers(queryKeys.groups.expenses(GROUP))).toBe(true);
        expect(covers(queryKeys.groups.balances(GROUP))).toBe(true);
        expect(covers(queryKeys.groups.settlements(GROUP))).toBe(true);
    });
});

describe('settlement writes', () => {
    it.each([
        ['create', () => hooks.useCreateSettlement(), { groupId: GROUP }],
        ['update', () => hooks.useUpdateSettlement(), { groupId: GROUP, settlementId: 's' }],
        ['delete', () => hooks.useDeleteSettlement(), { groupId: GROUP, settlementId: 's' }],
    ])('%s refreshes only that group', async (_label, useHook, variables) => {
        await run(renderHook(useHook), variables);
        sawExactly([queryKeys.groups.detail(GROUP)]);
    });

    it('leaves personal spending and the group lists alone', async () => {
        await run(renderHook(hooks.useCreateSettlement), { groupId: GROUP });

        // A repayment moves money between two members. It changes no bill, no
        // share, no personal expense, and neither the name nor the member count
        // a list card shows.
        [queryKeys.expenses.all, queryKeys.reports.all, queryKeys.groups.lists()].forEach((key) =>
            expect(invalidatedKeys()).not.toContainEqual(key)
        );
    });
});

describe('across every mutation', () => {
    const everyMutation = [
        [() => hooks.useCreateGroup(), { name: 'x' }],
        [() => hooks.useUpdateGroup(), { groupId: GROUP }],
        [() => hooks.useArchiveGroup(), GROUP],
        [() => hooks.useDeleteGroup(), GROUP],
        [() => hooks.useAddMember(), { groupId: GROUP }],
        [() => hooks.useDeleteMember(), { groupId: GROUP, memberId: 'm' }],
        [() => hooks.useCreateSharedExpense(), { groupId: GROUP }],
        [() => hooks.useDeleteSharedExpense(), { groupId: GROUP, expenseId: 'e' }],
        [() => hooks.useCreateSettlement(), { groupId: GROUP }],
        [() => hooks.useDeleteSettlement(), { groupId: GROUP, settlementId: 's' }],
    ];

    it('never clears the whole cache', async () => {
        for (const [useHook, variables] of everyMutation) {
            await run(renderHook(useHook), variables);
        }
        // clear() belongs to logout. Here it would throw away the month of
        // expenses the user was looking at to reflect a renamed group.
        expect(cleared).toBe(0);
    });

    it('never invalidates everything', async () => {
        for (const [useHook, variables] of everyMutation) {
            await run(renderHook(useHook), variables);
        }
        invalidatedKeys().forEach((key) => {
            expect(Array.isArray(key)).toBe(true);
            expect(key.length).toBeGreaterThan(0);
        });
    });

    it('exposes a pending flag for the submit guard', () => {
        const box = renderHook(hooks.useCreateGroup);
        expect(box.current.isPending).toBe(false);
        expect(typeof box.current.mutateAsync).toBe('function');
    });
});

describe('reads', () => {
    it('keep the two lists in separate cache entries', () => {
        renderHook(() => hooks.useGroups(false));
        renderHook(() => hooks.useGroups(true));

        const keys = client.getQueryCache().getAll().map((entry) => entry.queryKey);
        expect(keys).toContainEqual(queryKeys.groups.list(false));
        expect(keys).toContainEqual(queryKeys.groups.list(true));
    });

    it('do not fire without a group id', () => {
        const { groupBalanceService } = require('../../services/groups');
        renderHook(() => hooks.useGroupBalances(undefined));
        expect(groupBalanceService.get).not.toHaveBeenCalled();
    });
});
