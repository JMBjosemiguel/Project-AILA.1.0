import { getFeedbackSummary } from '../services/api/feedbackService';
import { useAsyncData } from './useAsyncData';

export function useFeedbackData(refreshKey) {
  return useAsyncData(getFeedbackSummary, [refreshKey]);
}
