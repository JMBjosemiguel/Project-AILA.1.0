const { body, param } = require('express-validator');

const taskIdParamValidator = [
  param('taskId').isInt({ min: 1 }).withMessage('Invalid task id.'),
];

const EXTRA_FIELD_RULES = [
  body('color').optional({ values: 'null' }).trim().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid color.'),
  body('notes').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('repeat_interval').optional({ values: 'null' }).trim().isIn(['none', 'daily', 'weekly']),
  body('remind_me').optional({ values: 'null' }).isBoolean(),
  body('difficulty').optional({ values: 'null' }).trim().isIn(['easy', 'medium', 'hard']),
  body('estimated_minutes').optional({ values: 'null' }).isInt({ min: 1, max: 600 }),
  body('subject_id').optional({ values: 'null' }).isInt({ min: 1 }),
];

const createTaskValidator = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 200 }),
  body('description').optional({ values: 'null' }).trim(),
  body('deadline').optional({ values: 'null' }).isISO8601().withMessage('Invalid deadline.'),
  body('priority_id').optional({ values: 'null' }).isInt({ min: 1 }),
  ...EXTRA_FIELD_RULES,
];

const updateTaskValidator = [
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional({ values: 'null' }).trim(),
  body('deadline').optional({ values: 'null' }).isISO8601().withMessage('Invalid deadline.'),
  body('priority_id').optional({ values: 'null' }).isInt({ min: 1 }),
  body('status').optional().isIn(['pending', 'in_progress', 'completed']),
  ...EXTRA_FIELD_RULES,
];

module.exports = {
  taskIdParamValidator,
  createTaskValidator,
  updateTaskValidator,
};
