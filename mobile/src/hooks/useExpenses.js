import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expenseService } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

export const useExpenses = (period) =>
    useQuery({
        queryKey: queryKeys.expenses.month(period),
        queryFn: async () => (await expenseService.getAll(period)).data,
    });

// Every write invalidates the whole expenses prefix rather than one month: an
// edit can move an expense between months, which leaves two of them wrong.
// Reports are aggregations of the same rows, so they go stale together.
const useExpenseMutation = (mutationFn) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
        },
    });
};

export const useCreateExpense = () =>
    useExpenseMutation(async (payload) => (await expenseService.create(payload)).data);

export const useUpdateExpense = () =>
    useExpenseMutation(async ({ id, ...payload }) => (await expenseService.update(id, payload)).data);

export const useDeleteExpense = () =>
    useExpenseMutation(async (id) => (await expenseService.delete(id)).data);
