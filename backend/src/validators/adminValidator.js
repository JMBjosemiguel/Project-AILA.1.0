const { body, param, query } = require('express-validator');

const userIdParamValidator = [
  param('userId').isInt({ min: 1 }).withMessage('Invalid user id.'),
];

const resourceIdParamValidator = [
  param('resourceId').isInt({ min: 1 }).withMessage('Invalid resource id.'),
];

const courseIdParamValidator = [
  param('courseId').isInt({ min: 1 }).withMessage('Invalid course id.'),
];

const announcementIdParamValidator = [
  param('announcementId').isInt({ min: 1 }).withMessage('Invalid announcement id.'),
];

const updateAnnouncementValidator = [
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('body').optional().trim().notEmpty().isLength({ max: 2000 }),
];

const setUserActiveValidator = [
  body('is_active').isBoolean().withMessage('is_active must be a boolean.'),
];

const announcementValidator = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 200 }),
  body('body').trim().notEmpty().withMessage('Message is required.').isLength({ max: 2000 }),
  body('target_type').optional().trim().isIn(['all', 'user', 'course', 'year_level', 'role']),
  body('target_value').optional({ values: 'null' }).trim().isLength({ max: 100 }),
];

const paginationQueryValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim().isLength({ max: 200 }),
  query('sort').optional().trim(),
];

const bulkResourceValidator = [
  body('ids').isArray({ min: 1 }).withMessage('Select at least one resource.'),
  body('ids.*').isInt({ min: 1 }),
  body('action').isIn(['delete', 'archive']).withMessage('Invalid bulk action.'),
];

module.exports = {
  userIdParamValidator,
  resourceIdParamValidator,
  courseIdParamValidator,
  announcementIdParamValidator,
  updateAnnouncementValidator,
  setUserActiveValidator,
  announcementValidator,
  paginationQueryValidator,
  bulkResourceValidator,
};
