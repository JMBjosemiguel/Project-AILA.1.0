import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export async function getChatbotWorkspace() {
  const [history, suggested] = await Promise.all([
    apiClient.get(API_ENDPOINTS.chatbot.history),
    apiClient.get(API_ENDPOINTS.chatbot.suggestedQuestions),
  ]);

  return {
    conversations: history?.conversations ?? [],
    suggestedQuestions: suggested?.questions ?? [],
    categories: [],
  };
}

export function sendChatMessage(messageText, conversationId, resourceId) {
  return apiClient.post(API_ENDPOINTS.chatbot.messages, {
    message: messageText,
    conversation_id: conversationId ?? null,
    resource_id: resourceId ?? null,
  });
}

export function getConversationMessages(conversationId) {
  return apiClient.get(API_ENDPOINTS.chatbot.conversation(conversationId));
}

export function renameConversation(conversationId, title) {
  return apiClient.patch(API_ENDPOINTS.chatbot.conversation(conversationId), { title });
}

export function deleteConversation(conversationId) {
  return apiClient.delete(API_ENDPOINTS.chatbot.conversation(conversationId));
}

export function regenerateLastResponse(conversationId) {
  return apiClient.post(API_ENDPOINTS.chatbot.regenerate(conversationId));
}
