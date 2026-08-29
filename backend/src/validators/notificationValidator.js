const { param } = require('express-validator');

const notificationIdParamValidator = [
  param('notificationId').isInt({ min: 1 }).withMessage('Invalid notification id.'),
];

module.exports = {
  notificationIdParamValidator,
};
