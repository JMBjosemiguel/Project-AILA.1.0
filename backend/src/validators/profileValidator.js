const { body } = require('express-validator');

// Facebook is either a profile link on a Facebook domain, or a plain display
// name. Anything that looks like a link but isn't on facebook.com/fb.com/
// fb.me is rejected rather than stored as an arbitrary URL.
const FACEBOOK_LINK = /^(https?:\/\/)?((www|m|web)\.)?(facebook\.com|fb\.com|fb\.me)\/\S+$/i;
const FACEBOOK_NAME = /^[\p{L}\p{M}\p{N} .'_-]{1,100}$/u;
const LOOKS_LIKE_LINK = /:\/\/|^www\.|\.(com|me|net|org)\b|\//i;

function isFacebookNameOrLink(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return LOOKS_LIKE_LINK.test(text) ? FACEBOOK_LINK.test(text) : FACEBOOK_NAME.test(text);
}

// Digits with optional leading +, spaces, dashes and parentheses; 7-15 digits
// covers local (09171234567) and international (+63 917 123 4567) formats.
const CONTACT_NUMBER = /^\+?[\d\s()-]{7,30}$/;

function isContactNumber(value) {
  const text = String(value || '').trim();
  const digitCount = text.replace(/\D/g, '').length;
  return CONTACT_NUMBER.test(text) && digitCount >= 7 && digitCount <= 15;
}

const updateProfileValidator = [
  body('middle_name').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Middle name must be at most 100 characters.'),
  body('program').optional({ values: 'null' }).trim().isLength({ max: 150 }),
  body('year_level').optional({ values: 'null' }).isInt({ min: 1, max: 6 }),
  body('bio').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
  body('avatar_url').optional({ values: 'null' }).trim().isLength({ max: 255 }),
  body('leaderboard_opt_in').optional().isBoolean().withMessage('leaderboard_opt_in must be true or false.'),
  // '' is allowed for these two and means "clear it".
  body('facebook')
    .optional({ values: 'null' })
    .isString().trim()
    .isLength({ max: 255 }).withMessage('Facebook must be at most 255 characters.')
    .custom((value) => value === '' || isFacebookNameOrLink(value))
    .withMessage('Enter a Facebook name or a facebook.com link.'),
  body('contact_number')
    .optional({ values: 'null' })
    .isString().trim()
    .isLength({ max: 30 }).withMessage('Contact number must be at most 30 characters.')
    .custom((value) => value === '' || isContactNumber(value))
    .withMessage('Enter a valid contact number (digits, spaces, +, - and parentheses only).'),
];

const changePasswordValidator = [
  body('current_password').notEmpty().withMessage('Current password is required.'),
  body('new_password').isLength({ min: 8, max: 72 }).withMessage('New password must be 8 to 72 characters.'),
];

module.exports = {
  updateProfileValidator,
  changePasswordValidator,
  // exposed for unit tests only
  isFacebookNameOrLink,
  isContactNumber,
};
