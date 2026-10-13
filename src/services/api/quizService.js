import { apiClient, AI_GENERATION_REQUEST_TIMEOUT_MS } from './client';
import { API_ENDPOINTS } from './endpoints';

export function generateQuiz({ topic, quizType = 'multiple_choice', itemCount = 10, difficulty = 'medium', sourceType, sourceId }) {
  return apiClient.post(
    API_ENDPOINTS.quizzes.generate,
    { topic, quizType, itemCount, difficulty, sourceType, sourceId },
    { timeout: AI_GENERATION_REQUEST_TIMEOUT_MS }
  );
}

export function getQuiz(quizId) {
  return apiClient.get(API_ENDPOINTS.quizzes.quiz(quizId));
}

// --- Batched generation (practice quizzes above the single-request item count) ---

// Creates the quiz row + a subtopic plan. Returns { quizId, target, batchSize, subtopics }.
export function startBatchQuizGeneration({ topic, quizType = 'multiple_choice', itemCount, difficulty = 'medium', sourceType, sourceId }) {
  return apiClient.post(
    API_ENDPOINTS.quizzes.batchStart,
    { topic, quizType, itemCount, difficulty, sourceType, sourceId },
    { timeout: AI_GENERATION_REQUEST_TIMEOUT_MS }
  );
}

// Generates + appends up to one batch's worth of items. Returns { quizId, added, total, target }.
export function appendQuizBatch(quizId, { subtopic, requestedCount } = {}) {
  return apiClient.post(
    API_ENDPOINTS.quizzes.batch(quizId),
    { subtopic, requestedCount },
    { timeout: AI_GENERATION_REQUEST_TIMEOUT_MS }
  );
}

// Corrects item_count to the real saved count. Returns { quizId, target, actual }.
export function finishQuizGeneration(quizId) {
  return apiClient.post(API_ENDPOINTS.quizzes.batchFinish(quizId));
}

// Used by the Learning Hub search box. Returns { quizzes: [] } for a blank term.
export function searchQuizzes(term) {
  const params = new URLSearchParams({ search: term || '' });
  return apiClient.get(`${API_ENDPOINTS.quizzes.search}?${params.toString()}`);
}

// Persist an informal chatbot mini-quiz as the student's own practice quiz.
// Idempotent server-side: a repeat returns { alreadySaved: true, quizId, quiz }.
export function saveChatQuizAsQuiz(messageId) {
  return apiClient.post(API_ENDPOINTS.quizzes.fromChatMessage(messageId));
}

// The AI Assistant's "Saved quizzes" view — only this student's own
// chat-saved quizzes, never counted toward learning analytics.
export function getChatQuizzes() {
  return apiClient.get(API_ENDPOINTS.quizzes.chatQuizzes);
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
