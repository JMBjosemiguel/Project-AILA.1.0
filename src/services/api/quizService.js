import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function generateQuiz({ topic, quizType = 'multiple_choice', itemCount = 10, difficulty = 'medium', sourceType, sourceId }) {
  return apiClient.post(API_ENDPOINTS.quizzes.generate, { topic, quizType, itemCount, difficulty, sourceType, sourceId });
}

export function getQuiz(quizId) {
  return apiClient.get(API_ENDPOINTS.quizzes.quiz(quizId));
}

export function submitQuizAttempt(quizId, answers) {
  return apiClient.post(API_ENDPOINTS.quizzes.attempts(quizId), { answers });
}

export function getQuizAttempt(attemptId) {
  return apiClient.get(API_ENDPOINTS.quizzes.attempt(attemptId));
}

export function deleteQuizAttempt(attemptId) {
  return apiClient.delete(API_ENDPOINTS.quizzes.attempt(attemptId));
}
