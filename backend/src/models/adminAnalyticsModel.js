const { query } = require('../config/database');

async function getRegistrationsOverTime(days = 14) {
  return query(
    `
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users
      WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND deleted_at IS NULL
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    [days]
  );
}

async function getAiUsageOverTime(days = 14) {
  return query(
    `
      SELECT DATE(cm.created_at) AS date, COUNT(*) AS count
      FROM chat_messages cm
      WHERE cm.sender = 'user' AND cm.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(cm.created_at)
      ORDER BY date ASC
    `,
    [days]
  );
}

async function getQuizScoreTrend(days = 14) {
  return query(
    `
      SELECT DATE(completed_at) AS date, ROUND(AVG(score / total) * 100) AS avg_percent
      FROM quiz_attempts
      WHERE completed_at IS NOT NULL AND completed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `,
    [days]
  );
}

async function getLessonCompletionsOverTime(days = 14) {
  return query(
    `
      SELECT DATE(completed_at) AS date, COUNT(*) AS count
      FROM lesson_progress
      WHERE completed_at IS NOT NULL AND completed_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `,
    [days]
  );
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

async function getMostActiveStudents(limit = 5) {
  return query(
    `
      SELECT u.id, u.first_name, u.last_name, up.xp_points, up.level
      FROM users u
      INNER JOIN user_profiles up ON up.user_id = u.id
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'student') AND u.deleted_at IS NULL
      ORDER BY up.xp_points DESC
      LIMIT ?
    `,
    [limit]
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
  getPopularCourses,
  getPopularResources,
  getMostActiveStudents,
  getTopicMasteryPlatform,
};
