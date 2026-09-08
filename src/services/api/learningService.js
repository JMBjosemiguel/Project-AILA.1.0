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

// --- Course assessments (module checkpoints + course final) ---

export function getCourseAssessments(subjectId) {
  return apiClient.get(API_ENDPOINTS.learning.assessments(subjectId));
}

// Generates on first call, returns the same quiz thereafter. Take-safe payload.
export function openModuleCheckpoint(subjectId, moduleId) {
  return apiClient.post(API_ENDPOINTS.learning.moduleCheckpoint(subjectId, moduleId));
}

export function openCourseFinal(subjectId) {
  return apiClient.post(API_ENDPOINTS.learning.courseFinal(subjectId));
}
