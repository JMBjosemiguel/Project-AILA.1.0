const { body } = require('express-validator');

const updateProfileValidator = [
  body('program').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('year_level').optional({ values: 'null' }).isInt({ min: 1, max: 6 }),
  body('bio').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('avatar_url').optional({ values: 'null' }).trim().isLength({ max: 255 }),
  body('leaderboard_opt_in').optional().isBoolean().withMessage('leaderboard_opt_in must be true or false.'),
];

const changePasswordValidator = [
  body('current_password').notEmpty().withMessage('Current password is required.'),
  body('new_password').isLength({ min: 8, max: 72 }).withMessage('New password must be 8 to 72 characters.'),
];

module.exports = {
  updateProfileValidator,
  changePasswordValidator,
};
