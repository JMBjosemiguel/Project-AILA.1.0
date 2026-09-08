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

// POST /quizzes/from-chat-message/:messageId — save a chatbot mini-quiz as a
// persisted practice quiz. Idempotent: a repeat returns the existing quiz (200).
const saveFromChatMessage = asyncHandler(async (req, res) => {
  const result = await quizService.saveQuizFromChatMessage(req.auth.user.id, req.params.messageId);
  sendSuccess(
    res,
    { quizId: result.quizId, alreadySaved: result.alreadySaved, quiz: result.quiz },
    result.alreadySaved ? 200 : 201,
    result.alreadySaved ? 'Already saved to your quizzes.' : 'Saved to your quizzes.'
  );
});

// POST /quizzes/:quizId/attempts/start — begin or resume an attempt.
const startAttempt = asyncHandler(async (req, res) => {
  const attempt = await quizService.startAttempt(req.auth.user.id, req.params.quizId);
  sendSuccess(res, attempt, 200, 'Attempt ready.');
});

// PATCH /quizzes/attempts/:attemptId/answers — autosave one answer.
const saveAnswer = asyncHandler(async (req, res) => {
  const result = await quizService.saveAttemptAnswer(req.auth.user.id, req.params.attemptId, {
    questionId: req.body.questionId,
    selectedAnswer: req.body.selectedAnswer,
    currentIndex: req.body.currentIndex,
  });
  sendSuccess(res, result, 200, 'Answer saved.');
});

// POST /quizzes/attempts/:attemptId/submit — grade + freeze an attempt.
const submitAttempt = asyncHandler(async (req, res) => {
  const result = await quizService.submitAttempt(req.auth.user.id, req.params.attemptId);
  sendSuccess(res, result, 200, 'Quiz attempt submitted.');
});

// POST /quizzes/:quizId/attempts — legacy one-shot submission (kept for
// backward compatibility; runs through the same lifecycle internally).
const submitLegacyAttempt = asyncHandler(async (req, res) => {
  const result = await quizService.submitQuizAnswers(req.auth.user.id, req.params.quizId, req.body.answers || []);
  sendSuccess(res, result, 201, 'Quiz attempt recorded.');
});

const history = asyncHandler(async (req, res) => {
  const attempts = await quizService.listQuizHistory(req.auth.user.id);
  sendSuccess(res, { attempts }, 200, 'Quiz history retrieved.');
});

// GET /quizzes/attempts/:attemptId — resume (in progress) or review (submitted).
const getAttempt = asyncHandler(async (req, res) => {
  const attempt = await quizService.getAttempt(req.auth.user.id, req.params.attemptId);
  sendSuccess(res, attempt, 200, 'Quiz attempt retrieved.');
});

const deleteAttempt = asyncHandler(async (req, res) => {
  await quizService.deleteAttempt(req.auth.user.id, req.params.attemptId);
  sendSuccess(res, null, 200, 'Quiz attempt deleted.');
});

module.exports = {
  generate,
  getQuiz,
  saveFromChatMessage,
  startAttempt,
  saveAnswer,
  submitAttempt,
  submitLegacyAttempt,
  history,
  getAttempt,
  deleteAttempt,
};
