const { body, query } = require('express-validator');
const { TEXT_TOOLS } = require('../services/aiStudyToolsService');

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const generateValidator = [
  body('tool').trim().notEmpty().isIn(Object.keys(TEXT_TOOLS)).withMessage('Unsupported study tool.'),
  body('topic').trim().notEmpty().withMessage('Please provide a topic.').isLength({ max: 200 }),
  body('difficulty').optional().trim().isIn(DIFFICULTIES).withMessage('Invalid difficulty.'),
];

const objectivesPreviewValidator = [
  query('topic').trim().notEmpty().withMessage('Please provide a topic.').isLength({ max: 200 }),
  query('difficulty').optional().trim().isIn(DIFFICULTIES).withMessage('Invalid difficulty.'),
];

module.exports = {
  generateValidator,
  objectivesPreviewValidator,
};
