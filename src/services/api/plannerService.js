import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function getPlannerData() {
  return apiClient.get(API_ENDPOINTS.planner.tasks);
}

export function createStudyTask(task) {
  return apiClient.post(API_ENDPOINTS.planner.tasks, {
    title: task.title,
    description: task.description ?? null,
    deadline: task.deadline ?? null,
    priority_id: task.priority_id ?? null,
    color: task.color ?? null,
    notes: task.notes ?? null,
    repeat_interval: task.repeat_interval ?? null,
    remind_me: task.remind_me ?? null,
    difficulty: task.difficulty ?? null,
    estimated_minutes: task.estimated_minutes ?? null,
    subject_id: task.subject_id ?? null,
  });
}

export function updateStudyTask(taskId, updates) {
  return apiClient.patch(`${API_ENDPOINTS.planner.tasks}/${taskId}`, updates);
}

export function deleteStudyTask(taskId) {
  return apiClient.delete(`${API_ENDPOINTS.planner.tasks}/${taskId}`);
}

export function duplicateStudyTask(taskId) {
  return apiClient.post(`${API_ENDPOINTS.planner.tasks}/${taskId}/duplicate`);
}
