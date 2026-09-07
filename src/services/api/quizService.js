import { apiClient } from './client';
import { API_ENDPOINTS } from './endpoints';

export function generateQuiz({ topic, quizType = 'multiple_choice', itemCount = 10, difficulty = 'medium', sourceType, sourceId }) {
  return apiClient.post(API_ENDPOINTS.quizzes.generate, { topic, quizType, itemCount, difficulty, sourceType, sourceId });
}

export function getQuiz(quizId) {
  return apiClient.get(API_ENDPOINTS.quizzes.quiz(quizId));
}

// --- Resumable attempt lifecycle ---

// Begin or resume an attempt. Returns { attempt, quiz, items, answers }.
export function startQuizAttempt(quizId) {
  return apiClient.post(API_ENDPOINTS.quizzes.startAttempt(quizId));
}

// Autosave one answer. `currentIndex` persists the resume position.
export function saveAttemptAnswer(attemptId, { questionId, selectedAnswer, currentIndex }) {
  return apiClient.patch(API_ENDPOINTS.quizzes.attemptAnswers(attemptId), { questionId, selectedAnswer, currentIndex });
}

// Grade + freeze the attempt. Returns the review payload (answers + explanations).
export function submitAttempt(attemptId) {
  return apiClient.post(API_ENDPOINTS.quizzes.submitAttempt(attemptId));
}

// Resume (in progress) or review (submitted) an existing attempt by id.
export function getQuizAttempt(attemptId) {
  return apiClient.get(API_ENDPOINTS.quizzes.attempt(attemptId));
}

// Legacy one-shot submission — still used by the informal chatbot practice quiz.
export function submitQuizAttempt(quizId, answers) {
  return apiClient.post(API_ENDPOINTS.quizzes.attempts(quizId), { answers });
}

export function deleteQuizAttempt(attemptId) {
  return apiClient.delete(API_ENDPOINTS.quizzes.attempt(attemptId));
}
