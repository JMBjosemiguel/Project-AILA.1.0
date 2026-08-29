const { body, param } = require('express-validator');

const submitFeedbackValidator = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
  body('context_type').optional({ values: 'null' }).trim().isLength({ max: 50 }),
  body('context_id').optional({ values: 'null' }).isInt({ min: 1 }),
  body('comment').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
];

const feedbackIdParamValidator = [
  param('feedbackId').isInt({ min: 1 }).withMessage('Invalid feedback id.'),
];

const updateFeedbackValidator = [
  body('admin_notes').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['pending', 'resolved']),
];

module.exports = {
  submitFeedbackValidator,
  feedbackIdParamValidator,
  updateFeedbackValidator,
};
