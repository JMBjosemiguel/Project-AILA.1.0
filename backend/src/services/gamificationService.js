const ApiError = require('../utils/ApiError');
const gamificationModel = require('../models/gamificationModel');
const achievementService = require('./achievementService');
const { xpProgress } = require('../utils/gamification');
const { appStartOfWeek, APP_TIMEZONE } = require('../utils/appTime');

const LEADERBOARD_PERIODS = ['weekly', 'all_time'];
const BOARD_SIZE = 10;

// Leaderboard display name: first name + last initial, e.g. "Jose B.". Never the
// full surname, never the email, never the user id — see the privacy note in
// migration 006 and the batch spec.
function displayName(firstName, lastName) {
  const first = (firstName || '').trim() || 'Student';
  const initial = (lastName || '').trim().charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

/**
 * Start of the current leaderboard week — Monday 00:00 in the application
 * timezone (APP_TIMEZONE), returned as the equivalent UTC instant so it compares
 * directly against `xp_events.created_at`.
 *
 * This is the SAME clock the streak uses (see utils/appTime + touchStreak), so a
 * student never sees "today counted for my streak" and "today didn't count for
 * the weekly board" disagree.
 */
function startOfWeek(now = new Date()) {
  return appStartOfWeek(now);
}

// How close a locked achievement is to unlocking, 0..1. Binary achievements
// (no countable progress) sort last.
function closeness(achievement) {
  const p = achievement.progress;
  if (!p || !p.target) return 0;
  return Math.min(1, p.current / p.target);
}

async function getSummary(userId) {
  const [profile, streak, view] = await Promise.all([
    gamificationModel.getXpPoints(userId),
    gamificationModel.getStreak(userId),
    achievementService.getUserAchievementView(userId),
  ]);

  const progress = xpProgress(profile.xp_points);

  const recentAchievements = [...view.earned]
    .sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt))
    .slice(0, 3)
    .map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      category: a.category,
      iconKey: a.iconKey,
      earnedAt: a.earnedAt,
    }));

  const nextAchievements = [...view.locked]
    .sort((a, b) => closeness(b) - closeness(a))
    .slice(0, 3)
    .map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      category: a.category,
      iconKey: a.iconKey,
      progress: a.progress,
    }));

  return {
    xp: progress.currentXp,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    xpToNextLevel: progress.xpToNextLevel,
    progressPercent: progress.progressPercent,
    streak: {
      current: Number(streak.current_streak) || 0,
      best: Number(streak.longest_streak) || 0,
    },
    achievementCount: view.earnedCount,
    totalAchievements: view.totalCount,
    recentAchievements,
    nextAchievements,
    leaderboardOptIn: Boolean(profile.leaderboard_opt_in),
  };
}

async function getAchievements(userId) {
  const view = await achievementService.getUserAchievementView(userId);
  return {
    earned: view.earned,
    locked: view.locked,
    earnedCount: view.earnedCount,
    totalCount: view.totalCount,
  };
}

async function getLeaderboard(userId, period = 'all_time') {
  if (!LEADERBOARD_PERIODS.includes(period)) {
    throw new ApiError(400, 'Unsupported leaderboard period.');
  }

  const weekStart = startOfWeek();
  const rows = await gamificationModel.leaderboardRows(weekStart);

  const periodXp = (r) => (period === 'weekly' ? Number(r.weekly_xp) : Number(r.total_xp));

  // Primary sort: period XP desc. Secondary: user id asc — a stable, deterministic
  // tie-breaker so the board never reshuffles between requests.
  const sorted = [...rows].sort((a, b) => periodXp(b) - periodXp(a) || a.user_id - b.user_id);

  // Standard competition ranking ("1-2-2-4"): equal period XP shares a rank.
  let prevXp = null;
  let prevRank = 0;
  const ranked = sorted.map((r, index) => {
    const xp = periodXp(r);
    const rank = xp === prevXp ? prevRank : index + 1;
    prevXp = xp;
    prevRank = rank;
    return {
      rank,
      displayName: displayName(r.first_name, r.last_name),
      level: Number(r.level) || 1,
      xp,
      weeklyXp: Number(r.weekly_xp),
      totalXp: Number(r.total_xp),
    };
  });

  const meIndex = sorted.findIndex((r) => r.user_id === userId);
  const me = meIndex >= 0 ? { rank: ranked[meIndex].rank, xp: ranked[meIndex].xp } : null;

  return {
    period,
    weekStart: period === 'weekly' ? weekStart.toISOString() : null,
    timezone: period === 'weekly' ? APP_TIMEZONE : null,
    entries: ranked.slice(0, BOARD_SIZE),
    me,
  };
}

module.exports = {
  getSummary,
  getAchievements,
  getLeaderboard,
  LEADERBOARD_PERIODS,
  startOfWeek,
  displayName,
};
