import { getPlannerData } from '../services/api/plannerService';
import { useAsyncData } from './useAsyncData';

export function usePlannerData(refreshKey) {
  return useAsyncData(getPlannerData, [refreshKey]);
}
