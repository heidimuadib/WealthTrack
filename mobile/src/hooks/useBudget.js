import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { budgetService } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

// The API answers with { amount: 0 } rather than 404 when no budget is set, so
// there is no empty case to handle here.
export const useBudget = (period) =>
    useQuery({
        queryKey: queryKeys.budget.month(period),
        queryFn: async () => (await budgetService.get(period.month, period.year)).data,
        select: (data) => data?.amount || 0,
    });

export const useSetBudget = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload) => (await budgetService.set(payload)).data,
        // Writing the result straight into the cache saves a refetch of a
        // value the response already contains.
        onSuccess: (budget, { month, year }) => {
            queryClient.setQueryData(queryKeys.budget.month({ month, year }), budget);
        },
    });
};
