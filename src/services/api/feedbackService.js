import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getFeedbackSummary() {
  return apiClient.get(API_ENDPOINTS.feedback.summary);
}

export function submitFeedback(payload) {
  return apiClient.post(API_ENDPOINTS.feedback.feedback, payload);
}

export function getMyFeedback() {
  return apiClient.get(API_ENDPOINTS.feedback.mine);
}

export function deleteFeedback(feedbackId) {
  return apiClient.delete(API_ENDPOINTS.feedback.entry(feedbackId));
}
