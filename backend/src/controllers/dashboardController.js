const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const dashboardService = require('../services/dashboardService');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getSummary(req.auth.user.id);
  sendSuccess(res, summary, 200, 'Dashboard retrieved.');
});

module.exports = {
  getSummary,
};
