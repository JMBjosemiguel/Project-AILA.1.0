import { getChatbotWorkspace } from '../services/api/chatService';
import { useAsyncData } from './useAsyncData';

export function useChatbotData(refreshKey) {
  return useAsyncData(getChatbotWorkspace, [refreshKey]);
}
