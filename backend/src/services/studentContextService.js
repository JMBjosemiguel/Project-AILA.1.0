const { query } = require('../config/database');

const WEAK_SCORE_THRESHOLD = 60;
const STALE_TOPIC_DAYS = 3;

async function getCurrentCourses(userId) {
  return query(
    'SELECT id, name, difficulty, goal FROM subjects WHERE created_by = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
}

async function getWeakTopics(userId) {
  return query(
    `
      SELECT COALESCE(t.id, lt.id) AS topic_id, COALESCE(t.title, lt.title) AS topic, s.name AS subject,
        ROUND(AVG(qa.score / qa.total) * 100, 0) AS avg_percent,
        COUNT(*) AS attempt_count
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      LEFT JOIN topics t ON q.source_type = 'topic' AND t.id = q.source_id
      LEFT JOIN lessons l ON q.source_type = 'lesson' AND l.id = q.source_id
      LEFT JOIN topics lt ON lt.id = l.topic_id
      LEFT JOIN modules m ON m.id = COALESCE(t.module_id, lt.module_id)
      LEFT JOIN subjects s ON s.id = m.subject_id
      WHERE qa.user_id = ? AND (t.id IS NOT NULL OR lt.id IS NOT NULL)
      GROUP BY COALESCE(t.id, lt.id), COALESCE(t.title, lt.title), s.name
      HAVING avg_percent < ?
      ORDER BY avg_percent ASC
      LIMIT 5
    `,
    [userId, WEAK_SCORE_THRESHOLD]
  );
}

async function getStaleTopics(userId) {
  return query(
    `
      SELECT t.id AS topic_id, t.title AS topic, s.name AS subject, lp.progress_percent, lp.updated_at
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.user_id = ? AND lp.status = 'in_progress'
        AND lp.updated_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY lp.updated_at ASC
      LIMIT 5
    `,
    [userId, STALE_TOPIC_DAYS]
  );
}

async function getStreakRisk(userId) {
  const rows = await query(
    'SELECT current_streak, last_active_date FROM learning_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const streak = rows[0];
  if (!streak) return { atRisk: false, currentStreak: 0 };

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastActiveStr = streak.last_active_date ? new Date(streak.last_active_date).toISOString().slice(0, 10) : null;

  return {
    atRisk: streak.current_streak > 0 && lastActiveStr !== todayStr,
    currentStreak: streak.current_streak,
  };
}

async function getPreferredDifficulty(userId) {
  const rows = await query(
    `
      SELECT difficulty, COUNT(*) AS count
      FROM subjects
      WHERE created_by = ? AND difficulty IS NOT NULL AND deleted_at IS NULL
      GROUP BY difficulty
      ORDER BY count DESC
      LIMIT 1
    `,
    [userId]
  );
  return rows[0]?.difficulty || null;
}

async function getStudentContext(userId) {
  const [courses, weakTopics, staleTopics, streakRisk, preferredDifficulty] = await Promise.all([
    getCurrentCourses(userId),
    getWeakTopics(userId),
    getStaleTopics(userId),
    getStreakRisk(userId),
    getPreferredDifficulty(userId),
  ]);

  return { courses, weakTopics, staleTopics, streakRisk, preferredDifficulty };
}

function buildRecommendation(context) {
  const { weakTopics, staleTopics, streakRisk, courses } = context;

  if (weakTopics.length) {
    const top = weakTopics[0];
    return {
      type: 'weak_topic',
      title: `Review ${top.topic}`,
      message: `You scored ${top.avg_percent}% on average in "${top.topic}"${top.subject ? ` (${top.subject})` : ''}. Reviewing this before your next quiz should help.`,
      topicId: top.topic_id,
    };
  }

  if (staleTopics.length) {
    const top = staleTopics[0];
    return {
      type: 'stale_topic',
      title: `Continue ${top.topic}`,
      message: `You started "${top.topic}"${top.subject ? ` in ${top.subject}` : ''} but haven't touched it in a few days. Pick it back up to keep your progress moving.`,
      topicId: top.topic_id,
    };
  }

  if (streakRisk.atRisk) {
    return {
      type: 'streak_risk',
      title: 'Keep your streak alive',
      message: `You're on a ${streakRisk.currentStreak}-day streak. Study something today to keep it going.`,
      topicId: null,
    };
  }

  if (!courses.length) {
    return {
      type: 'get_started',
      title: 'Start your first course',
      message: 'Add a course in Learning Hub and AILA will build a personalized roadmap for you.',
      topicId: null,
    };
  }

  return {
    type: 'on_track',
    title: "You're on track",
    message: 'No weak spots detected right now — keep up the momentum.',
    topicId: null,
  };
}

function buildContextSummaryText(context) {
  const { courses, weakTopics, preferredDifficulty } = context;
  const lines = [];

  if (courses.length) {
    lines.push(`This student is currently studying: ${courses.map((c) => c.name).join(', ')}.`);
  }
  if (preferredDifficulty) {
    lines.push(`Their preferred difficulty level is ${preferredDifficulty}.`);
  }
  if (weakTopics.length) {
    lines.push(`They have shown weaker quiz performance on: ${weakTopics.map((t) => t.topic).join(', ')} — adapt explanations and examples accordingly when relevant.`);
  }

  return lines.length ? lines.join(' ') : '';
}

module.exports = {
  getStudentContext,
  buildRecommendation,
  buildContextSummaryText,
};
