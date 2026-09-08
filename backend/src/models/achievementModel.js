const { query, execute } = require('../config/database');

async function listActiveAchievements() {
  return query(
    'SELECT id, slug, name, description, category, icon_key, xp_reward, criteria_type, criteria_value, sort_order FROM achievements WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  );
}

async function listUserAchievements(userId) {
  return query(
    'SELECT achievement_id, earned_at, source FROM user_achievements WHERE user_id = ?',
    [userId]
  );
}

// Active achievements in the given categories that the user has NOT yet earned.
async function listUnearnedInCategories(userId, categories, connection = null) {
  if (!categories.length) return [];
  const placeholders = categories.map(() => '?').join(', ');
  return execute(
    connection,
    `SELECT id, slug, name, description, category, icon_key, xp_reward, criteria_type, criteria_value
       FROM achievements
      WHERE is_active = 1 AND category IN (${placeholders})
        AND id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = ?)
      ORDER BY sort_order ASC, id ASC`,
    [...categories, userId]
  );
}

// INSERT IGNORE — the UNIQUE(user_id, achievement_id) is the final guard against
// concurrent double-grants. Returns true only when a new row was written.
async function grantAchievement(userId, achievementId, source, connection = null) {
  const result = await execute(
    connection,
    'INSERT IGNORE INTO user_achievements (user_id, achievement_id, source) VALUES (?, ?, ?)',
    [userId, achievementId, source]
  );
  return Boolean(result.affectedRows);
}

// The authoritative per-user metrics every criterion is evaluated against —
// computed once per evaluation from real completion/attempt/streak records
// (never from the activity log, which can contain duplicate rows).
async function getUserMetrics(userId, connection = null) {
  const [lessons] = await execute(connection, 'SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ?', [userId]);
  const [quizzes] = await execute(
    connection,
    `SELECT
        MAX(status = 'submitted') AS has_submitted,
        MAX(status = 'submitted' AND total > 0 AND score = total) AS has_perfect
       FROM quiz_attempts WHERE user_id = ?`,
    [userId]
  );
  const [assess] = await execute(
    connection,
    `SELECT
        MAX(q.assessment_kind = 'module_checkpoint' AND a.passed = 1) AS has_checkpoint,
        MAX(q.assessment_kind = 'course_final' AND a.passed = 1) AS has_final
       FROM quiz_attempts a
       INNER JOIN quizzes q ON q.id = a.quiz_id
      WHERE a.user_id = ?`,
    [userId]
  );
  const [streak] = await execute(
    connection,
    'SELECT GREATEST(COALESCE(current_streak, 0), COALESCE(longest_streak, 0)) AS days FROM learning_streaks WHERE user_id = ?',
    [userId]
  );
  const [profile] = await execute(connection, 'SELECT level FROM user_profiles WHERE user_id = ?', [userId]);

  return {
    lessonsCompleted: Number(lessons?.c || 0),
    hasSubmittedQuiz: Boolean(Number(quizzes?.has_submitted || 0)),
    hasPerfectQuiz: Boolean(Number(quizzes?.has_perfect || 0)),
    hasPassedCheckpoint: Boolean(Number(assess?.has_checkpoint || 0)),
    hasPassedFinal: Boolean(Number(assess?.has_final || 0)),
    streakDays: Number(streak?.days || 0),
    level: Number(profile?.level || 1),
  };
}

// For the Achievements page: every catalog row + whether/when the user earned it.
async function listCatalogWithUserState(userId) {
  return query(
    `SELECT a.id, a.slug, a.name, a.description, a.category, a.icon_key, a.xp_reward,
            a.criteria_type, a.criteria_value, a.sort_order,
            ua.earned_at, ua.source
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      WHERE a.is_active = 1
      ORDER BY a.sort_order ASC, a.id ASC`,
    [userId]
  );
}

async function listAllUserIds() {
  return (await query('SELECT id FROM users WHERE deleted_at IS NULL')).map((r) => r.id);
}

module.exports = {
  listActiveAchievements,
  listUserAchievements,
  listUnearnedInCategories,
  grantAchievement,
  getUserMetrics,
  listCatalogWithUserState,
  listAllUserIds,
};
