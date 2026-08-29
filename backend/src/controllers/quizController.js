const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const quizService = require('../services/quizService');

const generate = asyncHandler(async (req, res) => {
  const { topic, quizType = 'multiple_choice', itemCount = 10, difficulty = 'medium', sourceType, sourceId } = req.body;

  const quiz = await quizService.generateAndSaveQuiz({
    userId: req.auth.user.id,
    topic,
    quizType,
    itemCount,
    difficulty,
    sourceType,
    sourceId,
  });

  sendSuccess(res, quiz, 201, 'Quiz generated.');
});

const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await quizService.getQuizForUser(req.auth.user.id, req.params.quizId);
  sendSuccess(res, quiz, 200, 'Quiz retrieved.');
});

const submitAttempt = asyncHandler(async (req, res) => {
  const result = await quizService.submitAttempt(req.auth.user.id, req.params.quizId, req.body.answers || []);
  sendSuccess(res, result, 201, 'Quiz attempt recorded.');
});

const history = asyncHandler(async (req, res) => {
  const attempts = await quizService.listQuizHistory(req.auth.user.id);
  sendSuccess(res, { attempts }, 200, 'Quiz history retrieved.');
});

const getAttempt = asyncHandler(async (req, res) => {
  const attempt = await quizService.getAttemptReview(req.auth.user.id, req.params.attemptId);
  sendSuccess(res, attempt, 200, 'Quiz attempt retrieved.');
});

const deleteAttempt = asyncHandler(async (req, res) => {
  await quizService.deleteAttempt(req.auth.user.id, req.params.attemptId);
  sendSuccess(res, null, 200, 'Quiz attempt deleted.');
});

module.exports = {
  generate,
  getQuiz,
  submitAttempt,
  history,
  getAttempt,
  deleteAttempt,
};
