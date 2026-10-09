import { apiClient, AI_GENERATION_REQUEST_TIMEOUT_MS, COURSE_GENERATION_REQUEST_TIMEOUT_MS } from './client';
import { API_ENDPOINTS } from './endpoints';

export async function getLearningHubData() {
  const { subjects } = await apiClient.get(API_ENDPOINTS.learning.subjects);
  return { subjects };
}

export function getLesson(lessonId) {
  // Generates the lesson's content on first load (server-side), so this can
  // be a slow AI request, not just a read.
  return apiClient.get(API_ENDPOINTS.learning.lesson(lessonId), { timeout: COURSE_GENERATION_REQUEST_TIMEOUT_MS });
}

export function completeLesson(lessonId) {
  return apiClient.post(API_ENDPOINTS.learning.completeLesson(lessonId));
}

export function generateCourse({ courseName, difficulty, goal }) {
  return apiClient.post(API_ENDPOINTS.learning.generateCourse, { courseName, difficulty, goal }, { timeout: COURSE_GENERATION_REQUEST_TIMEOUT_MS });
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
  return apiClient.post(API_ENDPOINTS.learning.moduleCheckpoint(subjectId, moduleId), undefined, { timeout: AI_GENERATION_REQUEST_TIMEOUT_MS });
}

export function openCourseFinal(subjectId) {
  return apiClient.post(API_ENDPOINTS.learning.courseFinal(subjectId), undefined, { timeout: AI_GENERATION_REQUEST_TIMEOUT_MS });
}
