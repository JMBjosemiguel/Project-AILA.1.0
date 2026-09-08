const { query } = require('../config/database');
const { notifyUser } = require('./notify');

const XP_PER_LEVEL = 100;

function levelForXp(xp) {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

// Single source of truth for "how far into this level" — Dashboard, Profile and
// the gamification summary all use this so they can never disagree.
function xpProgress(xp) {
  const currentXp = Math.max(0, Math.round(Number(xp) || 0));
  const level = levelForXp(currentXp);
  const xpIntoLevel = currentXp - (level - 1) * XP_PER_LEVEL;
  const xpForNextLevel = XP_PER_LEVEL;
  return {
    currentXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel: xpForNextLevel - xpIntoLevel,
    progressPercent: Math.round((xpIntoLevel / xpForNextLevel) * 100),
  };
}

function toDateStr(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function runner(connection) {
  return connection
    ? (sql, params) => connection.execute(sql, params).then(([result]) => result)
    : (sql, params) => query(sql, params);
}

/**
 * Award XP exactly once per (user, eventKey).
 *
 * The unique constraint on xp_events(user_id, event_key) is the idempotency
 * guard: a duplicate award — a quiz retake, a double-submitted request, a
 * concurrent race — inserts 0 rows and re-awards nothing. user_profiles.xp_points
 * / level are recomputed from SUM(xp_events) so the cached balance can never
 * drift from the ledger.
 */
async function awardXpOnce(userId, { eventKey, points, reason }, connection = null) {
  const amount = Math.round(Number(points) || 0);
  if (!eventKey || amount <= 0) {
    return { awarded: 0, duplicate: false };
  }

  const run = runner(connection);

  const claim = await run(
    'INSERT IGNORE INTO xp_events (user_id, event_key, points, reason) VALUES (?, ?, ?, ?)',
    [userId, eventKey, amount, reason || null]
  );
  if (!claim.affectedRows) {
    return { awarded: 0, duplicate: true };
  }

  const totalRows = await run(
    'SELECT COALESCE(SUM(points), 0) AS total FROM xp_events WHERE user_id = ?',
    [userId]
  );
  const total = Number(totalRows[0]?.total ?? 0);
  const previousLevel = levelForXp(total - amount);
  const level = levelForXp(total);

  await run('UPDATE user_profiles SET xp_points = ?, level = ? WHERE user_id = ?', [total, level, userId]);
  await run(
    'INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, ?, ?, ?)',
    [userId, 'xp_earned', amount, `+${amount} XP - ${reason || 'Learning activity'}`]
  );

  const leveledUp = level > previousLevel;
  if (leveledUp) {
    await notifyUser(userId, {
      type: 'system',
      title: 'Level up!',
      body: `You reached Level ${level}. Keep up the momentum.`,
      connection,
    });
  }

  return { awarded: amount, duplicate: false, total, level, previousLevel, leveledUp };
}

/**
 * Record that the user did something streak-worthy today (UTC calendar day).
 *
 * A single INSERT ... ON DUPLICATE KEY UPDATE so it is safe when two qualifying
 * events land in the same transaction window or race concurrently: the
 * UNIQUE(user_id) row lock serializes them and the second one is a no-op because
 * `last_active_date` is already today. The day-to-day advance rule (consecutive
 * day -> +1, gap -> reset to 1, same day -> unchanged) is expressed entirely in
 * the UPDATE clause against the pre-update row values. `longest_streak` is
 * assigned before `current_streak` so it still sees the old count.
 */
async function touchStreak(userId, connection = null) {
  const run = runner(connection);

  const todayStr = toDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  await run(
    `
      INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date)
      VALUES (?, 1, 1, ?)
      ON DUPLICATE KEY UPDATE
        longest_streak = GREATEST(
          longest_streak,
          CASE WHEN last_active_date = ? THEN current_streak
               WHEN last_active_date = ? THEN current_streak + 1
               ELSE 1 END
        ),
        current_streak = CASE
          WHEN last_active_date = ? THEN current_streak
          WHEN last_active_date = ? THEN current_streak + 1
          ELSE 1 END,
        last_active_date = ?
    `,
    [userId, todayStr, todayStr, yesterdayStr, todayStr, yesterdayStr, todayStr]
  );
}

async function logActivity(userId, activityType, referenceId, description, connection = null) {
  const sql = 'INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, ?, ?, ?)';
  const params = [userId, activityType, referenceId, description];

  if (connection) {
    await connection.execute(sql, params);
  } else {
    await query(sql, params);
  }
}

module.exports = {
  XP_PER_LEVEL,
  levelForXp,
  xpProgress,
  awardXpOnce,
  touchStreak,
  logActivity,
};
