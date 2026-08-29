import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getNotificationsData() {
  return apiClient.get(API_ENDPOINTS.notifications.notifications);
}

export function markNotificationRead(notificationId) {
  return apiClient.patch(`${API_ENDPOINTS.notifications.notifications}/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return apiClient.post(API_ENDPOINTS.notifications.markAllRead);
}

export function deleteNotification(notificationId) {
  return apiClient.delete(`${API_ENDPOINTS.notifications.notifications}/${notificationId}`);
}

export function deleteAllNotifications() {
  return apiClient.delete(API_ENDPOINTS.notifications.notifications);
}
