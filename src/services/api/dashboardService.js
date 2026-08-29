import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getDashboardData() {
  return apiClient.get(API_ENDPOINTS.dashboard.summary);
}
