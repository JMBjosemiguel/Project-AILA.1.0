import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export async function getLearningHubData() {
  const { subjects } = await apiClient.get(API_ENDPOINTS.learning.subjects);
  return { subjects };
}

export function getLesson(lessonId) {
  return apiClient.get(API_ENDPOINTS.learning.lesson(lessonId));
}

export function completeLesson(lessonId) {
  return apiClient.post(API_ENDPOINTS.learning.completeLesson(lessonId));
}

export function generateCourse({ courseName, difficulty, goal }) {
  return apiClient.post(API_ENDPOINTS.learning.generateCourse, { courseName, difficulty, goal });
}

export function deleteCourse(subjectId) {
  return apiClient.delete(API_ENDPOINTS.learning.subject(subjectId));
}
