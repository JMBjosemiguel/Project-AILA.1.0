import { getChatQuizzes } from '../services/api/quizService';
import { useAsyncData } from './useAsyncData';

export function useSavedChatQuizzes(refreshKey) {
  return useAsyncData(getChatQuizzes, [refreshKey]);
}
