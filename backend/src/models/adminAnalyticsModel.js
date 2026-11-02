const { query } = require('../config/database');
const { appWindowStart, windowStartDays, countByAppDay, avgPercentByAppDay, groupByWeek } = require('../utils/dayBucket');
const { appWeekStarts } = require('../utils/appTime');
const { notChatQuizCondition } = require('../constants/chatQuizVisibility');
const { quizSubjectJoins, QUIZ_SUBJECT_VISIBLE_CONDITION } = require('../constants/subjectVisibility');

const STUDENT_ROLE = "(SELECT id FROM roles WHERE name = 'student')";

async function getRegistrationsOverTime(days = 14) {
  const rows = await query(
    `
      SELECT created_at AS ts
      FROM users
      WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND deleted_at IS NULL
        AND created_at >= ?
    `,
    [appWindowStart(days - 1)]
  );
  const validDays = new Set(windowStartDays(days));
  return countByAppDay(rows, 'ts').filter((row) => validDays.has(row.date));
}

async function getAiUsageOverTime(days = 14) {
  const rows = await query(
    `
      SELECT cm.created_at AS ts
      FROM chat_messages cm
      WHERE cm.sender = 'user' AND cm.created_at >= ?
    `,
    [appWindowStart(days - 1)]
  );
  const validDays = new Set(windowStartDays(days));
  return countByAppDay(rows, 'ts').filter((row) => validDays.has(row.date));
}

async function getQuizScoreTrend(days = 14) {
  const rows = await query(
    `
      SELECT completed_at AS ts, score, total
      FROM quiz_attempts
      WHERE completed_at IS NOT NULL AND completed_at >= ?
    `,
    [appWindowStart(days - 1)]
  );
  const validDays = new Set(windowStartDays(days));
  return avgPercentByAppDay(rows, 'ts').filter((row) => validDays.has(row.date));
}

async function getLessonCompletionsOverTime(days = 14) {
  const rows = await query(
    `
      SELECT completed_at AS ts
      FROM lesson_progress
      WHERE completed_at IS NOT NULL AND completed_at >= ?
    `,
    [appWindowStart(days - 1)]
  );
  const validDays = new Set(windowStartDays(days));
  return countByAppDay(rows, 'ts').filter((row) => validDays.has(row.date));
}

// One row per week for the last `weeks` weeks, oldest first. Weeks start on
// Monday 00:00 in APP_TIMEZONE, the same boundary as the weekly leaderboard.
// Active students = students with any dashboard activity that week (the same
// signal as the admin dashboard's daily active-students chart). Every column
// counts students only (not admins or deleted accounts). Chat quizzes are left
// out of the quiz numbers, like the student analytics.
async function getWeeklyResults(weeks = 8, now = new Date()) {
  const starts = appWeekStarts(weeks, now);
  const from = starts[0];
  const [activity, attempts, lessons, registrations] = await Promise.all([
    query(
      `
        SELECT dal.user_id, dal.created_at AS ts
        FROM dashboard_activity_log dal
        INNER JOIN users u ON u.id = dal.user_id
        WHERE dal.created_at >= ? AND u.deleted_at IS NULL AND u.role_id = ${STUDENT_ROLE}
      `,
      [from]
    ),
    query(
      `
        SELECT qa.completed_at AS ts, qa.score, qa.total
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        INNER JOIN users u ON u.id = qa.user_id
        WHERE qa.status = 'submitted' AND qa.completed_at >= ? AND ${notChatQuizCondition('q')}
          AND u.deleted_at IS NULL AND u.role_id = ${STUDENT_ROLE}
      `,
      [from]
    ),
    query(
      `
        SELECT lp.completed_at AS ts
        FROM lesson_progress lp
        INNER JOIN users u ON u.id = lp.user_id
        WHERE lp.completed_at >= ? AND u.deleted_at IS NULL AND u.role_id = ${STUDENT_ROLE}
      `,
      [from]
    ),
    query(
      `SELECT created_at AS ts FROM users WHERE role_id = ${STUDENT_ROLE} AND deleted_at IS NULL AND created_at >= ?`,
      [from]
    ),
  ]);

  const activityByWeek = groupByWeek(activity, starts);
  const attemptsByWeek = groupByWeek(attempts, starts);
  const lessonsByWeek = groupByWeek(lessons, starts);
  const registrationsByWeek = groupByWeek(registrations, starts);

  return starts.map((start, i) => {
    const scored = attemptsByWeek[i].filter((row) => Number(row.total) > 0);
    const avgQuizScore = scored.length
      ? Math.round(scored.reduce((sum, row) => sum + (Number(row.score) / Number(row.total)) * 100, 0) / scored.length)
      : null;
    return {
      weekStart: start.toISOString(),
      activeStudents: new Set(activityByWeek[i].map((row) => row.user_id)).size,
      quizzesCompleted: attemptsByWeek[i].length,
      avgQuizScore,
      lessonsCompleted: lessonsByWeek[i].length,
      newRegistrations: registrationsByWeek[i].length,
    };
  });
}

async function getPopularCourses(limit = 5) {
  return query(
    `
      SELECT name, COUNT(*) AS generations
      FROM subjects
      WHERE deleted_at IS NULL
      GROUP BY name
      ORDER BY generations DESC, name ASC
      LIMIT ?
    `,
    [limit]
  );
}

async function getPopularResources(limit = 5) {
  return query(
    `
      SELECT r.id, r.title, r.type, COUNT(rvl.id) AS views
      FROM resources r
      LEFT JOIN resource_views_log rvl ON rvl.resource_id = r.id
      WHERE r.deleted_at IS NULL
      GROUP BY r.id, r.title, r.type
      ORDER BY views DESC
      LIMIT ?
    `,
    [limit]
  );
}

// Most active = most studying: lessons completed + quizzes completed
// (submitted, chat quizzes excluded), with the average quiz score (raw %).
async function getMostActiveStudents(limit = 5) {
  const rows = await query(
    `
      SELECT u.id, u.first_name, u.last_name,
        (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id) AS lessons_completed,
        qs.quizzes_completed, qs.avg_quiz_score
      FROM users u
      LEFT JOIN (
        SELECT qa.user_id, COUNT(*) AS quizzes_completed,
          ROUND(AVG(CASE WHEN qa.total > 0 THEN qa.score / qa.total * 100 END), 0) AS avg_quiz_score
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        ${quizSubjectJoins('q')}
        WHERE qa.status = 'submitted' AND ${notChatQuizCondition('q')}
          AND ${QUIZ_SUBJECT_VISIBLE_CONDITION}
        GROUP BY qa.user_id
      ) qs ON qs.user_id = u.id
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'student') AND u.deleted_at IS NULL
      ORDER BY (lessons_completed + COALESCE(qs.quizzes_completed, 0)) DESC, u.id ASC
      LIMIT ?
    `,
    [limit]
  );
  return rows.map((row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    lessons_completed: Number(row.lessons_completed) || 0,
    quizzes_completed: Number(row.quizzes_completed) || 0,
    avg_quiz_score: row.avg_quiz_score == null ? null : Number(row.avg_quiz_score),
  }));
}

// One row per (student, topic) with progress — the same FROM/JOIN/WHERE shape
// as getTopicMasteryPlatform above, just ungrouped, so the caller can pool
// rows per AI-defined topic group (weighted avg, distinct student count)
// instead of only per individual topic.
async function getTopicProgressRaw() {
  return query(
    `
      SELECT lp.user_id, t.id, t.title, s.name AS course_name, lp.progress_percent
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.status != 'not_started'
    `
  );
}

async function getTopicMasteryPlatform(order = 'desc', limit = 5) {
  return query(
    `
      SELECT t.title AS topic, s.name AS subject, ROUND(AVG(lp.progress_percent)) AS avg_percent
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.status != 'not_started'
      GROUP BY t.id, t.title, s.name
      ORDER BY avg_percent ${order === 'asc' ? 'ASC' : 'DESC'}
      LIMIT ?
    `,
    [limit]
  );
}

module.exports = {
  getRegistrationsOverTime,
  getAiUsageOverTime,
  getQuizScoreTrend,
  getLessonCompletionsOverTime,
  getWeeklyResults,
  getPopularCourses,
  getPopularResources,
  getMostActiveStudents,
  getTopicProgressRaw,
  getTopicMasteryPlatform,
};
