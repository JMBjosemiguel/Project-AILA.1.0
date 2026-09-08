const { query } = require('../config/database');

const WEAK_SCORE_THRESHOLD = 60;
const STRONG_SCORE_THRESHOLD = 80;
const STALE_TOPIC_DAYS = 3;
const RECENT_ATTEMPTS_WINDOW = 10;

async function getCurrentCourses(userId) {
  return query(
    'SELECT id, name, difficulty, goal FROM subjects WHERE created_by = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
}

// Topics where this student's own quiz attempts average below the threshold.
// Optionally scoped to a single subject so course/lesson/quiz generation can
// prioritise weak areas *within the course being generated*.
async function getWeakTopics(userId, { subjectId = null } = {}) {
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
      WHERE qa.user_id = ? AND qa.status = 'submitted' AND qa.total > 0
        AND (t.id IS NOT NULL OR lt.id IS NOT NULL)
        ${subjectId ? 'AND s.id = ?' : ''}
      GROUP BY COALESCE(t.id, lt.id), COALESCE(t.title, lt.title), s.name
      HAVING avg_percent < ?
      ORDER BY avg_percent ASC
      LIMIT 5
    `,
    subjectId ? [userId, subjectId, WEAK_SCORE_THRESHOLD] : [userId, WEAK_SCORE_THRESHOLD]
  );
}

// Topics the student has already demonstrated strong performance on — used to
// avoid over-drilling basics the student has mastered.
async function getStrongTopics(userId, { subjectId = null } = {}) {
  return query(
    `
      SELECT COALESCE(t.id, lt.id) AS topic_id, COALESCE(t.title, lt.title) AS topic, s.name AS subject,
        ROUND(AVG(qa.score / qa.total) * 100, 0) AS avg_percent
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      LEFT JOIN topics t ON q.source_type = 'topic' AND t.id = q.source_id
      LEFT JOIN lessons l ON q.source_type = 'lesson' AND l.id = q.source_id
      LEFT JOIN topics lt ON lt.id = l.topic_id
      LEFT JOIN modules m ON m.id = COALESCE(t.module_id, lt.module_id)
      LEFT JOIN subjects s ON s.id = m.subject_id
      WHERE qa.user_id = ? AND qa.status = 'submitted' AND qa.total > 0
        AND (t.id IS NOT NULL OR lt.id IS NOT NULL)
        ${subjectId ? 'AND s.id = ?' : ''}
      GROUP BY COALESCE(t.id, lt.id), COALESCE(t.title, lt.title), s.name
      HAVING avg_percent >= ?
      ORDER BY avg_percent DESC
      LIMIT 5
    `,
    subjectId ? [userId, subjectId, STRONG_SCORE_THRESHOLD] : [userId, STRONG_SCORE_THRESHOLD]
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

// Rolling average of the student's most recent submitted quizzes (0-100), or
// null if they have not completed any. Optionally scoped to one subject.
async function getRecentQuizAverage(userId, { subjectId = null } = {}) {
  const rows = await query(
    `
      SELECT ROUND(AVG(pct) * 100, 0) AS avg_percent, COUNT(*) AS attempt_count
      FROM (
        SELECT qa.score / qa.total AS pct
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        ${subjectId ? `
          LEFT JOIN topics t ON q.source_type = 'topic' AND t.id = q.source_id
          LEFT JOIN lessons l ON q.source_type = 'lesson' AND l.id = q.source_id
          LEFT JOIN topics lt ON lt.id = l.topic_id
          LEFT JOIN modules m ON m.id = COALESCE(t.module_id, lt.module_id)
        ` : ''}
        WHERE qa.user_id = ? AND qa.status = 'submitted' AND qa.total > 0
        ${subjectId ? 'AND m.subject_id = ?' : ''}
        ORDER BY qa.completed_at DESC
        LIMIT ${RECENT_ATTEMPTS_WINDOW}
      ) recent
    `,
    subjectId ? [userId, subjectId] : [userId]
  );
  const row = rows[0];
  if (!row || row.attempt_count === 0) return null;
  return { average: Number(row.avg_percent), attemptCount: Number(row.attempt_count) };
}

// Percentage of the subject's lessons this student has completed.
async function getSubjectProgress(userId, subjectId) {
  const rows = await query(
    `
      SELECT COUNT(l.id) AS total_lessons, COUNT(lpr.completed_at) AS completed_lessons
      FROM lessons l
      INNER JOIN topics t ON t.id = l.topic_id AND t.deleted_at IS NULL
      INNER JOIN modules m ON m.id = t.module_id AND m.deleted_at IS NULL
      LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = ?
      WHERE m.subject_id = ? AND l.deleted_at IS NULL
    `,
    [userId, subjectId]
  );
  const row = rows[0] || { total_lessons: 0, completed_lessons: 0 };
  const total = Number(row.total_lessons) || 0;
  const completed = Number(row.completed_lessons) || 0;
  return { totalLessons: total, completedLessons: completed, progressPercent: total ? Math.round((completed / total) * 100) : 0 };
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

// The student's most common self-chosen course difficulty, as a proxy for a
// preferred level (there is no dedicated profile field for this).
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
  // primitives — one place for the SQL, composed by personalizationService
  getWeakTopics,
  getStrongTopics,
  getStaleTopics,
  getRecentQuizAverage,
  getSubjectProgress,
  getPreferredDifficulty,
  getStreakRisk,
};
