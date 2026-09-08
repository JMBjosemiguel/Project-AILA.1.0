const { param, body } = require('express-validator');

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

const generateCourseValidator = [
  body('courseName').trim().notEmpty().withMessage('Please enter a course name.').isLength({ max: 150 }),
  body('difficulty').trim().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty.'),
  body('goal').trim().notEmpty().withMessage('Please enter a learning goal.').isLength({ max: 150 }),
];

module.exports = {
  lessonIdParamValidator,
  generateCourseValidator,
  subjectIdParamValidator,
  moduleCheckpointParamValidator,
};
