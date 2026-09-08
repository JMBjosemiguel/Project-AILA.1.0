const { query } = require('../config/database');

// One row per opted-in student with BOTH XP totals precomputed:
//   total_xp  — every ledger entry, legacy_balance included (all-time board)
//   weekly_xp — entries since `weekStart`, legacy_balance excluded (weekly board)
// Aggregating straight from xp_events (indexed on user_id, created_at) keeps the
// board honest — it never trusts the cached user_profiles.xp_points projection.
// Sorting / ranking / display-name shaping all happen in the service.
async function leaderboardRows(weekStart) {
  return query(
    `
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        up.level,
        COALESCE(SUM(xe.points), 0) AS total_xp,
        COALESCE(SUM(
          CASE WHEN xe.event_key <> 'legacy_balance' AND xe.created_at >= ?
               THEN xe.points ELSE 0 END
        ), 0) AS weekly_xp
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN xp_events xe ON xe.user_id = u.id
      WHERE u.deleted_at IS NULL
        AND up.leaderboard_opt_in = 1
      GROUP BY u.id, u.first_name, u.last_name, up.level
    `,
    [weekStart]
  );
}

async function getStreak(userId) {
  const rows = await query(
    'SELECT current_streak, longest_streak FROM learning_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || { current_streak: 0, longest_streak: 0 };
}

async function getXpPoints(userId) {
  const rows = await query('SELECT xp_points, leaderboard_opt_in FROM user_profiles WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || { xp_points: 0, leaderboard_opt_in: 0 };
}

module.exports = {
  leaderboardRows,
  getStreak,
  getXpPoints,
};
