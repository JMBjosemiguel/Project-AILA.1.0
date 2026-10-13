const express = require('express');
const quizController = require('../controllers/quizController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter, quizBatchRateLimiter } = require('../middlewares/aiRateLimiter');
const {
  generateValidator,
  batchStartValidator,
  batchAppendValidator,
  quizIdParamValidator,
  attemptIdParamValidator,
  submitAttemptValidator,
  saveAnswerValidator,
  chatMessageIdParamValidator,
  searchQuizzesValidator,
} = require('../validators/quizValidator');

const router = express.Router();

router.post('/generate', authenticate, aiRateLimiter, generateValidator, validateRequest, quizController.generate);
// Batched generation (practice quizzes above the single-request item count).
// Registered ahead of the /:quizId catch-all routes below.
router.post('/generate/batch-start', authenticate, aiRateLimiter, batchStartValidator, validateRequest, quizController.startBatchGeneration);
router.post('/:quizId/generate/batch', authenticate, quizBatchRateLimiter, quizIdParamValidator, batchAppendValidator, validateRequest, quizController.appendBatch);
router.post('/:quizId/generate/finish', authenticate, quizIdParamValidator, validateRequest, quizController.finishBatchGeneration);
// Persist an informal chatbot mini-quiz as the student's own practice quiz. No
// AI call, no aiRateLimiter — it copies already-generated questions.
router.post('/from-chat-message/:messageId', authenticate, chatMessageIdParamValidator, validateRequest, quizController.saveFromChatMessage);
router.get('/history', authenticate, quizController.history);
// Registered ahead of the /:quizId catch-all so "search"/"chat" are never read as a quiz id.
router.get('/search', authenticate, searchQuizzesValidator, validateRequest, quizController.search);
// GET /quizzes/chat — the AI Assistant's "Saved quizzes" view.
router.get('/chat', authenticate, quizController.listChatQuizzes);

// Resumable attempt lifecycle.
router.post('/:quizId/attempts/start', authenticate, quizIdParamValidator, validateRequest, quizController.startAttempt);
router.patch('/attempts/:attemptId/answers', authenticate, saveAnswerValidator, validateRequest, quizController.saveAnswer);
router.post('/attempts/:attemptId/submit', authenticate, attemptIdParamValidator, validateRequest, quizController.submitAttempt);

router.get('/attempts/:attemptId', authenticate, attemptIdParamValidator, validateRequest, quizController.getAttempt);
router.delete('/attempts/:attemptId', authenticate, attemptIdParamValidator, validateRequest, quizController.deleteAttempt);

// Legacy one-shot submission — kept for backward compatibility.
router.post('/:quizId/attempts', authenticate, quizIdParamValidator, submitAttemptValidator, validateRequest, quizController.submitLegacyAttempt);

router.get('/:quizId', authenticate, quizIdParamValidator, validateRequest, quizController.getQuiz);

module.exports = router;
