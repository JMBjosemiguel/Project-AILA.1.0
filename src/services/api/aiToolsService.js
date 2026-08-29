import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function generateStudyTool({ tool, topic, difficulty = 'medium' }) {
  return apiClient.post(API_ENDPOINTS.aiTools.generate, { tool, topic, difficulty });
}

export function getStudyToolObjectives(topic, difficulty = 'medium') {
  return apiClient.get(`${API_ENDPOINTS.aiTools.objectivesPreview}?topic=${encodeURIComponent(topic)}&difficulty=${difficulty}`);
}
