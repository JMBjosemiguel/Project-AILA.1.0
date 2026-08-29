const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const analyticsService = require('../services/analyticsService');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await analyticsService.getSummary(req.auth.user.id);
  sendSuccess(res, summary, 200, 'Analytics retrieved.');
});

module.exports = {
  getSummary,
};
