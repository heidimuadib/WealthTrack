import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
    groupService,
    groupMemberService,
    sharedExpenseService,
    groupBalanceService,
    settlementService,
} from '../services/groups';
import { queryKeys } from '../lib/queryKeys';

// Reads.
//
// No options are passed: staleTime and gcTime come from the shared client, so a
// group behaves like every other screen in the app — cached content stays on
// screen while a refetch runs behind it, rather than blinking back to a
// skeleton.

export const useGroups = (archived = false) =>
    useQuery({
        queryKey: queryKeys.groups.list(archived),
        queryFn: async () => (await groupService.list(archived)).data,
    });

export const useGroup = (groupId) =>
    useQuery({
        queryKey: queryKeys.groups.detail(groupId),
        queryFn: async () => (await groupService.get(groupId)).data,
        enabled: Boolean(groupId),
    });

export const useGroupExpenses = (groupId) =>
    useQuery({
        queryKey: queryKeys.groups.expenses(groupId),
        queryFn: async () => (await sharedExpenseService.list(groupId)).data,
        enabled: Boolean(groupId),
    });

export const useGroupBalances = (groupId) =>
    useQuery({
        queryKey: queryKeys.groups.balances(groupId),
        queryFn: async () => (await groupBalanceService.get(groupId)).data,
        enabled: Boolean(groupId),
    });

export const useGroupSettlements = (groupId) =>
    useQuery({
        queryKey: queryKeys.groups.settlements(groupId),
        queryFn: async () => (await settlementService.list(groupId)).data,
        enabled: Boolean(groupId),
    });

// Invalidation.
//
// Each of these names exactly what the write could have changed, and nothing
// else. queryClient.clear() would be simpler and is what the logout path does,
// but here it would throw away the month of expenses the user was looking at to
// reflect a renamed group.

const invalidateGroupLists = (client) =>
    // Both lists, always: archiving moves a group from one to the other, so
    // refreshing only the one in front of the user leaves the other stale.
    client.invalidateQueries({ queryKey: queryKeys.groups.lists() });

// The detail key is a prefix over a group's expenses, balances and settlements,
// so one call covers everything about that group and touches no other.
const invalidateGroup = (client, groupId) =>
    client.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });

// A shared expense writes a mirrored row into the user's own expense table, so
// personal spending changes with it. These are the same two prefixes the
// ordinary expense mutations already invalidate.
const invalidatePersonalSpending = (client) => {
    client.invalidateQueries({ queryKey: queryKeys.expenses.all });
    client.invalidateQueries({ queryKey: queryKeys.reports.all });
};

// Writes.
//
// isPending on the returned mutation is what screens use to disable a submit
// button, which is the whole of the double-submission guard at this layer.

export const useCreateGroup = () => {
    const client = useQueryClient();

    return useMutation({
        mutationFn: async (data) => (await groupService.create(data)).data,
        onSuccess: () => invalidateGroupLists(client),
    });
};

export const useUpdateGroup = () => {
    const client = useQueryClient();

    return useMutation({
        mutationFn: async ({ groupId, ...data }) => (await groupService.update(groupId, data)).data,
        onSuccess: (_result, { groupId }) => {
            invalidateGroup(client, groupId);
            // The name and colour are on the list card too.
            invalidateGroupLists(client);
        },
    });
};

const useGroupStateChange = (mutationFn) => {
    const client = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (_result, groupId) => {
            invalidateGroup(client, groupId);
            invalidateGroupLists(client);
        },
    });
};

export const useArchiveGroup = () =>
    useGroupStateChange(async (groupId) => (await groupService.archive(groupId)).data);

export const useUnarchiveGroup = () =>
    useGroupStateChange(async (groupId) => (await groupService.unarchive(groupId)).data);

export const useDeleteGroup = () =>
    useGroupStateChange(async (groupId) => (await groupService.remove(groupId)).data);

// Members appear on the detail screen and are named by every balance row, so a
// rename has to reach the balances as well — which the detail prefix covers.
// The lists carry only a member count, so they move only when one is added or
// removed, and this errs towards refreshing them either way rather than
// tracking which of the five member verbs changed the count.
const useMemberMutation = (mutationFn) => {
    const client = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (_result, { groupId }) => {
            invalidateGroup(client, groupId);
            invalidateGroupLists(client);
        },
    });
};

export const useAddMember = () =>
    useMemberMutation(
        async ({ groupId, ...data }) => (await groupMemberService.create(groupId, data)).data
    );

export const useUpdateMember = () =>
    useMemberMutation(
        async ({ groupId, memberId, ...data }) =>
            (await groupMemberService.update(groupId, memberId, data)).data
    );

export const useArchiveMember = () =>
    useMemberMutation(
        async ({ groupId, memberId }) => (await groupMemberService.archive(groupId, memberId)).data
    );

export const useUnarchiveMember = () =>
    useMemberMutation(
        async ({ groupId, memberId }) =>
            (await groupMemberService.unarchive(groupId, memberId)).data
    );

export const useDeleteMember = () =>
    useMemberMutation(
        async ({ groupId, memberId }) => (await groupMemberService.remove(groupId, memberId)).data
    );

// A shared expense is the one write that reaches outside its group: it changes
// the group's own ledger AND the user's personal spending, through the mirrored
// row the server keeps in step.
const useSharedExpenseMutation = (mutationFn) => {
    const client = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (_result, { groupId }) => {
            invalidateGroup(client, groupId);
            invalidatePersonalSpending(client);
        },
    });
};

export const useCreateSharedExpense = () =>
    useSharedExpenseMutation(
        async ({ groupId, ...data }) => (await sharedExpenseService.create(groupId, data)).data
    );

export const useUpdateSharedExpense = () =>
    useSharedExpenseMutation(
        async ({ groupId, expenseId, ...data }) =>
            (await sharedExpenseService.update(groupId, expenseId, data)).data
    );

export const useDeleteSharedExpense = () =>
    useSharedExpenseMutation(
        async ({ groupId, expenseId }) => (await sharedExpenseService.remove(groupId, expenseId)).data
    );

// A repayment moves money between two members. It changes no bill, no share and
// no personal expense — so the personal spending prefixes are deliberately left
// alone, and the group lists are too: they carry a member count and a name,
// neither of which a repayment touches.
const useSettlementMutation = (mutationFn) => {
    const client = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (_result, { groupId }) => invalidateGroup(client, groupId),
    });
};

export const useCreateSettlement = () =>
    useSettlementMutation(
        async ({ groupId, ...data }) => (await settlementService.create(groupId, data)).data
    );

export const useUpdateSettlement = () =>
    useSettlementMutation(
        async ({ groupId, settlementId, ...data }) =>
            (await settlementService.update(groupId, settlementId, data)).data
    );

export const useDeleteSettlement = () =>
    useSettlementMutation(
        async ({ groupId, settlementId }) =>
            (await settlementService.remove(groupId, settlementId)).data
    );
