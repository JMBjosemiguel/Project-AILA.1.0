import { getAnalyticsData } from '../services/api/analyticsService';
import { useAsyncData } from './useAsyncData';

export function useAnalyticsData() {
  return useAsyncData(getAnalyticsData, []);
}
