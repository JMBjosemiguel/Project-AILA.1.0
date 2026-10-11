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

// resourceId is only ever sent on the ONE message where the attachment
// actually changed — omitted entirely otherwise, so the backend's own
// "undefined = no change" default keeps grounding on whatever it already
// has. Pass `clearResource: true` for the one message that detaches it
// (sends an EXPLICIT resource_id: null, which the backend treats as
// distinct from the field being absent).
export function sendChatMessage(messageText, conversationId, resourceId, { clearResource = false } = {}) {
  const body = { message: messageText, conversation_id: conversationId ?? null };
  if (clearResource) {
    body.resource_id = null;
  } else if (resourceId != null) {
    body.resource_id = resourceId;
  }
  return apiClient.post(API_ENDPOINTS.chatbot.messages, body);
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
