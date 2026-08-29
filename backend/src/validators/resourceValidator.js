const { param, query, body } = require('express-validator');

const resourceIdParamValidator = [
  param('resourceId').isInt({ min: 1 }).withMessage('Invalid resource id.'),
];

const listResourcesValidator = [
  query('type').optional().trim(),
  query('search').optional().trim().isLength({ max: 200 }),
  query('sort').optional().trim().isIn(['title', 'recent', 'popular']),
];

const addLinkValidator = [
  body('url').trim().isURL({ require_protocol: true }).withMessage('Please provide a valid link (including https://).'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('subject_id').optional().isInt({ min: 1 }),
];

const updateResourceValidator = [
  body('title').optional().trim().notEmpty().isLength({ max: 200 }).withMessage('Title cannot be empty.'),
  body('subject_id').optional({ values: 'null' }).isInt({ min: 1 }),
];

module.exports = {
  resourceIdParamValidator,
  listResourcesValidator,
  addLinkValidator,
  updateResourceValidator,
};
