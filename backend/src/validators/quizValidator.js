const { body, param } = require('express-validator');

const generateValidator = [
  body('topic').trim().notEmpty().withMessage('Please provide a topic.').isLength({ max: 200 }),
  body('quizType').optional().trim().isIn(['multiple_choice', 'true_false', 'identification']),
  body('itemCount').optional().isInt({ min: 1, max: 30 }),
  body('difficulty').optional().trim().isIn(['easy', 'medium', 'hard']),
  body('sourceType').optional().trim().isIn(['chat', 'lesson', 'topic', 'resource', 'manual']),
  body('sourceId').optional({ values: 'null' }).isInt({ min: 1 }),
];

const quizIdParamValidator = [
  param('quizId').isInt({ min: 1 }).withMessage('Invalid quiz id.'),
];

const attemptIdParamValidator = [
  param('attemptId').isInt({ min: 1 }).withMessage('Invalid attempt id.'),
];

const chatMessageIdParamValidator = [
  param('messageId').isInt({ min: 1 }).withMessage('Invalid message id.'),
];

// Legacy one-shot submission: POST /quizzes/:quizId/attempts
const submitAttemptValidator = [
  body('answers').isArray().withMessage('Answers must be an array.'),
  body('answers.*.questionId').isInt({ min: 1 }),
  body('answers.*.selectedAnswer').optional({ values: 'null' }).trim(),
];

// Autosave one answer: PATCH /quizzes/attempts/:attemptId/answers
const saveAnswerValidator = [
  param('attemptId').isInt({ min: 1 }).withMessage('Invalid attempt id.'),
  body('questionId').isInt({ min: 1 }).withMessage('A questionId is required.'),
  body('selectedAnswer').optional({ values: 'null' }).isString().isLength({ max: 500 }).trim(),
  body('currentIndex').optional({ values: 'null' }).isInt({ min: 0, max: 200 }),
];

module.exports = {
  generateValidator,
  quizIdParamValidator,
  attemptIdParamValidator,
  chatMessageIdParamValidator,
  submitAttemptValidator,
  saveAnswerValidator,
};
