const { query } = require('../config/database');
const { notifyUser } = require('./notify');

const XP_PER_LEVEL = 100;

function levelForXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function toDateStr(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function awardXp(userId, amount, reason, connection = null) {
  const exec = connection
    ? (sql, params) => connection.execute(sql, params).then(([result]) => result)
    : (sql, params) => query(sql, params);

  const selectSql = 'SELECT xp_points FROM user_profiles WHERE user_id = ? LIMIT 1';
  const rows = connection
    ? (await connection.execute(selectSql, [userId]))[0]
    : await query(selectSql, [userId]);

  const currentXp = rows[0]?.xp_points ?? 0;
  const previousLevel = levelForXp(currentXp);
  const nextXp = currentXp + amount;
  const nextLevel = levelForXp(nextXp);

  await exec('UPDATE user_profiles SET xp_points = ?, level = ? WHERE user_id = ?', [nextXp, nextLevel, userId]);
  await exec(
    'INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, ?, ?, ?)',
    [userId, 'xp_earned', amount, `+${amount} XP - ${reason}`]
  );

  if (nextLevel > previousLevel) {
    await notifyUser(userId, {
      type: 'system',
      title: 'Level up!',
      body: `You reached Level ${nextLevel}. Keep up the momentum.`,
      connection,
    });
  }

  return { xp: nextXp, level: nextLevel };
}

async function touchStreak(userId, connection = null) {
  const exec = connection
    ? (sql, params) => connection.execute(sql, params).then(([result]) => result)
    : (sql, params) => query(sql, params);

  const selectSql = 'SELECT current_streak, longest_streak, last_active_date FROM learning_streaks WHERE user_id = ? LIMIT 1';
  const rows = connection
    ? (await connection.execute(selectSql, [userId]))[0]
    : await query(selectSql, [userId]);

  const todayStr = toDateStr(new Date());

  if (!rows.length) {
    await exec(
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

  await exec(
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
  awardXp,
  touchStreak,
  logActivity,
};
