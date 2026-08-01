import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

export const useCategories = () =>
    useQuery({
        queryKey: queryKeys.categories.all,
        queryFn: async () => (await categoryService.getAll()).data,
    });

const useCategoryMutation = (mutationFn) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
            // Expenses embed their category, so a rename or recolour has to
            // reach the lists showing them too — and the report names
            // categories as well.
            queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
        },
    });
};

export const useCreateCategory = () =>
    useCategoryMutation(async (payload) => (await categoryService.create(payload)).data);

export const useUpdateCategory = () =>
    useCategoryMutation(async ({ id, ...payload }) => (await categoryService.update(id, payload)).data);

export const useDeleteCategory = () =>
    useCategoryMutation(async (id) => (await categoryService.delete(id)).data);
