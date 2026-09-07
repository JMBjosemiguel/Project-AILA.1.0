const express = require('express');
const quizController = require('../controllers/quizController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const {
  generateValidator,
  quizIdParamValidator,
  attemptIdParamValidator,
  submitAttemptValidator,
  saveAnswerValidator,
} = require('../validators/quizValidator');

const router = express.Router();

router.post('/generate', authenticate, aiRateLimiter, generateValidator, validateRequest, quizController.generate);
router.get('/history', authenticate, quizController.history);

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
