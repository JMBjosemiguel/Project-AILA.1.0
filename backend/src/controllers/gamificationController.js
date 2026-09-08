const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const gamificationService = require('../services/gamificationService');

// GET /api/gamification/summary — XP/level/streak/achievement snapshot for the
// dashboard and profile widgets. Read-only, derived entirely server-side.
const getSummary = asyncHandler(async (req, res) => {
  const data = await gamificationService.getSummary(req.auth.user.id);
  sendSuccess(res, data, 200, 'Gamification summary retrieved.');
});

// GET /api/gamification/achievements — full earned + locked catalog with progress.
const getAchievements = asyncHandler(async (req, res) => {
  const data = await gamificationService.getAchievements(req.auth.user.id);
  sendSuccess(res, data, 200, 'Achievements retrieved.');
});

// GET /api/gamification/leaderboard?period=weekly|all_time — opted-in students only.
const getLeaderboard = asyncHandler(async (req, res) => {
  const period = req.query.period || 'all_time';
  const data = await gamificationService.getLeaderboard(req.auth.user.id, period);
  sendSuccess(res, data, 200, 'Leaderboard retrieved.');
});

module.exports = {
  getSummary,
  getAchievements,
  getLeaderboard,
};
