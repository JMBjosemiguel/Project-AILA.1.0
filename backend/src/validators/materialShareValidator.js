const { body, param } = require('express-validator');

const materialParamsValidator = [
  param('type').isIn(['subject', 'quiz']).withMessage('Unsupported material type.'),
  param('id').isInt({ min: 1 }).withMessage('Invalid material id.'),
];

const createShareValidator = [
  ...materialParamsValidator,
  body('visibility').optional().isIn(['unlisted']).withMessage('Only "unlisted" sharing is supported.'),
];

// Loose only — the service opaquely 404s any token that cannot be real, so a
// malformed / enumeration token gets the same "no longer available" response as
// a revoked one.
const shareTokenValidator = [
  param('token').isString().trim().notEmpty(),
];

module.exports = { materialParamsValidator, createShareValidator, shareTokenValidator };
