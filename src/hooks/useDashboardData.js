import { getDashboardData } from '../services/api/dashboardService';
import { useAsyncData } from './useAsyncData';

export function useDashboardData(refreshKey) {
  return useAsyncData(getDashboardData, [refreshKey]);
}
