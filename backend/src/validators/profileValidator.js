const { body } = require('express-validator');

const updateProfileValidator = [
  body('program').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('year_level').optional({ values: 'null' }).isInt({ min: 1, max: 6 }),
  body('bio').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('avatar_url').optional({ values: 'null' }).trim().isLength({ max: 255 }),
];

const changePasswordValidator = [
  body('current_password').notEmpty().withMessage('Current password is required.'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
];

module.exports = {
  updateProfileValidator,
  changePasswordValidator,
};
