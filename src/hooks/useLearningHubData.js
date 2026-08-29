import { getLearningHubData } from '../services/api/learningService';
import { useAsyncData } from './useAsyncData';

export function useLearningHubData(refreshKey) {
  return useAsyncData(getLearningHubData, [refreshKey]);
}
