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

// Structural checks only — the real per-quiz bounds (answers.length <= the
// quiz's actual question count, each index < that count) need the resolved
// quiz, so those are enforced in materialShareService.checkSharedQuizAnswers
// (also as a 422). 200 is just a sane upper bound to reject absurd payloads
// before any DB lookup.
const checkAnswersValidator = [
  param('token').isString().trim().notEmpty(),
  body('answers').isArray({ max: 200 }).withMessage('answers must be an array.'),
  body('answers.*.index')
    .exists().withMessage('Each answer needs an index.').bail()
    .isInt({ min: 0 }).withMessage('index must be a non-negative integer.').bail()
    .toInt(),
  body('answers.*.answer')
    .exists().withMessage('Each answer needs a value.').bail()
    .isString().withMessage('answer must be a string.').bail()
    .isLength({ max: 500 }).withMessage('answer must be 500 characters or fewer.'),
  body('answers').custom((answers) => {
    if (!Array.isArray(answers)) return true; // already rejected above
    const indexes = answers.map((a) => a && a.index);
    if (new Set(indexes).size !== indexes.length) {
      throw new Error('Duplicate answer indexes are not allowed.');
    }
    return true;
  }),
];

module.exports = { materialParamsValidator, createShareValidator, shareTokenValidator, checkAnswersValidator };
