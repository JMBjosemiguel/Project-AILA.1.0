import { getAnalyticsData } from '../services/api/analyticsService';
import { useAsyncData } from './useAsyncData';

export function useAnalyticsData(refreshKey) {
  return useAsyncData(getAnalyticsData, [refreshKey]);
}
