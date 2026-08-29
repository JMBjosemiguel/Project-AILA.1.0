import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

function toQueryString(params = {}) {
  const usable = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return new URLSearchParams(usable).toString();
}

export function listChatSessionUsers(params = {}) {
  return apiClient.get(`${API_ENDPOINTS.admin.chatSessionUsers}?${toQueryString(params)}`);
}

export function listChatSessionsForUser(userId, params = {}) {
  return apiClient.get(`${API_ENDPOINTS.admin.chatSessionsForUser(userId)}?${toQueryString(params)}`);
}

export function getChatSession(conversationId) {
  return apiClient.get(API_ENDPOINTS.admin.chatSession(conversationId));
}

export function deleteChatSession(conversationId) {
  return apiClient.delete(API_ENDPOINTS.admin.chatSession(conversationId));
}

export function archiveChatSession(conversationId) {
  return apiClient.post(API_ENDPOINTS.admin.chatSessionArchive(conversationId));
}

export function unarchiveChatSession(conversationId) {
  return apiClient.post(API_ENDPOINTS.admin.chatSessionUnarchive(conversationId));
}

export function renameChatSession(conversationId, title) {
  return apiClient.patch(API_ENDPOINTS.admin.chatSession(conversationId), { title });
}
