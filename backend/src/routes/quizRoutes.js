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
} = require('../validators/quizValidator');

const router = express.Router();

router.post('/generate', authenticate, aiRateLimiter, generateValidator, validateRequest, quizController.generate);
router.get('/history', authenticate, quizController.history);
router.get('/attempts/:attemptId', authenticate, attemptIdParamValidator, validateRequest, quizController.getAttempt);
router.delete('/attempts/:attemptId', authenticate, attemptIdParamValidator, validateRequest, quizController.deleteAttempt);
router.get('/:quizId', authenticate, quizIdParamValidator, validateRequest, quizController.getQuiz);
router.post('/:quizId/attempts', authenticate, quizIdParamValidator, submitAttemptValidator, validateRequest, quizController.submitAttempt);

module.exports = router;
