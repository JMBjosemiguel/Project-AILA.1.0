const { param, body } = require('express-validator');
const { COURSE_PURPOSE_KEYS, COURSE_LENGTH_KEYS, COURSE_FOCUS_KEYS } = require('../constants/courseOptions');

const lessonIdParamValidator = [
  param('lessonId').isInt({ min: 1 }).withMessage('Invalid lesson id.'),
];

const subjectIdParamValidator = [
  param('subjectId').isInt({ min: 1 }).withMessage('Invalid course id.'),
];

const moduleCheckpointParamValidator = [
  param('subjectId').isInt({ min: 1 }).withMessage('Invalid course id.'),
  param('moduleId').isInt({ min: 1 }).withMessage('Invalid module id.'),
];

// Only courseName is required — everything else (including the existing
// difficulty/goal) is optional with a sensible server-side default, so the
// original quick flow (just a name) still works exactly as before.
const generateCourseValidator = [
  body('courseName').trim().notEmpty().withMessage('Please enter a course name.').isLength({ max: 150 }),
  body('difficulty').optional().trim().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty.'),
  body('goal').optional({ values: 'falsy' }).trim().isLength({ max: 150 }),
  body('purpose').optional().trim().isIn(COURSE_PURPOSE_KEYS).withMessage('Invalid course purpose.'),
  body('length').optional().trim().isIn(COURSE_LENGTH_KEYS).withMessage('Invalid course length.'),
  body('focus').optional().isArray({ max: COURSE_FOCUS_KEYS.length }).withMessage('Invalid focus selection.'),
  body('focus.*').trim().isIn(COURSE_FOCUS_KEYS).withMessage('Invalid focus selection.'),
];

module.exports = {
  lessonIdParamValidator,
  generateCourseValidator,
  subjectIdParamValidator,
  moduleCheckpointParamValidator,
};
