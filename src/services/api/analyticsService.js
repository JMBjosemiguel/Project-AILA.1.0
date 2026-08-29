import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getAnalyticsData() {
  return apiClient.get(API_ENDPOINTS.analytics.summary);
}
