const { query } = require('../config/database');
const { notifyUser } = require('./notify');

const XP_PER_LEVEL = 100;

function levelForXp(xp) {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
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

  if (level > previousLevel) {
    await notifyUser(userId, {
      type: 'system',
      title: 'Level up!',
      body: `You reached Level ${level}. Keep up the momentum.`,
      connection,
    });
  }

  return { awarded: amount, duplicate: false, total, level };
}

async function touchStreak(userId, connection = null) {
  const run = runner(connection);

  const rows = await run(
    'SELECT current_streak, longest_streak, last_active_date FROM learning_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );

  const todayStr = toDateStr(new Date());

  if (!rows.length) {
    await run(
      'INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date) VALUES (?, 1, 1, ?)',
      [userId, todayStr]
    );
    return;
  }

  const { current_streak: currentStreak, longest_streak: longestStreak, last_active_date: lastActiveDate } = rows[0];
  const lastActiveStr = lastActiveDate ? toDateStr(lastActiveDate) : null;

  if (lastActiveStr === todayStr) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateStr(yesterday);

  const nextStreak = lastActiveStr === yesterdayStr ? currentStreak + 1 : 1;
  const nextLongest = Math.max(longestStreak, nextStreak);

  await run(
    'UPDATE learning_streaks SET current_streak = ?, longest_streak = ?, last_active_date = ? WHERE user_id = ?',
    [nextStreak, nextLongest, todayStr, userId]
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
  levelForXp,
  awardXpOnce,
  touchStreak,
  logActivity,
};
