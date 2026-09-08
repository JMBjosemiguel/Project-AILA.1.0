const { query } = require('express-validator');

// Period is an allowlist — anything else is a 422 before the service runs.
const leaderboardValidator = [
  query('period').optional().isIn(['weekly', 'all_time']).withMessage('period must be "weekly" or "all_time".'),
];

module.exports = {
  leaderboardValidator,
};
