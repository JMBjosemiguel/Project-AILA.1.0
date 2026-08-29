const { body } = require('express-validator');

const registerValidator = [
  body('first_name').trim().notEmpty().withMessage('First name is required.').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail().isLength({ max: 150 }),
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8 to 72 characters.'),
  body('confirm_password')
    .optional({ values: 'falsy' })
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Password confirmation does not match.'),
  body('student_number').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('program').optional({ values: 'falsy' }).trim().isLength({ max: 150 }),
  body('year_level')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 6 })
    .withMessage('Year level must be between 1 and 6.'),
];

const loginValidator = [
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

module.exports = {
  registerValidator,
  loginValidator,
};
