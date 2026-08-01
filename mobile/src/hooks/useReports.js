import { useQuery } from '@tanstack/react-query';
import { reportService } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

export const useReportSummary = (year) =>
    useQuery({
        queryKey: queryKeys.reports.year(year),
        queryFn: async () => (await reportService.summary(year)).data,
    });
