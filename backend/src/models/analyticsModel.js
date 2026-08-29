const { query } = require('../config/database');

async function getCompletionCounts(userId) {
  const rows = await query(
    `
      SELECT
        (SELECT COUNT(*) FROM lesson_progress WHERE user_id = ?) AS completed_lessons,
        (SELECT COUNT(*) FROM learning_progress WHERE user_id = ? AND status = 'completed') AS completed_topics,
        (
          SELECT COUNT(DISTINCT m.subject_id)
          FROM learning_progress lp
          INNER JOIN topics t ON t.id = lp.topic_id
          INNER JOIN modules m ON m.id = t.module_id
          WHERE lp.user_id = ? AND lp.status = 'completed'
        ) AS completed_subjects
    `,
    [userId, userId, userId]
  );
  return rows[0];
}

async function getStudyHoursThisWeek(userId) {
  return query(
    `
      SELECT DATE(started_at) AS date, ROUND(SUM(COALESCE(duration_minutes, 0)) / 60, 1) AS hours
      FROM study_sessions
      WHERE user_id = ? AND started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(started_at)
      ORDER BY date ASC
    `,
    [userId]
  );
}

async function getMasteryBySubject(userId) {
  return query(
    `
      SELECT s.id, s.name, ROUND(AVG(lp.progress_percent), 0) AS pct
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.user_id = ?
      GROUP BY s.id, s.name
      ORDER BY pct DESC
    `,
    [userId]
  );
}

async function getChatUsageBreakdown(userId) {
  return query(
    `
      SELECT cm.message_type, COUNT(*) AS count
      FROM chat_messages cm
      INNER JOIN chat_conversations cc ON cc.id = cm.conversation_id
      WHERE cc.user_id = ? AND cm.sender = 'bot'
      GROUP BY cm.message_type
    `,
    [userId]
  );
}

async function getQuizPerformanceTrend(userId) {
  return query(
    `
      SELECT DATE(completed_at) AS date, ROUND(AVG(score / total) * 100, 0) AS avg_percent
      FROM quiz_attempts
      WHERE user_id = ? AND completed_at IS NOT NULL
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
      LIMIT 14
    `,
    [userId]
  );
}

async function getXpOverTime(userId, days = 14) {
  return query(
    `
      SELECT DATE(created_at) AS date, SUM(COALESCE(reference_id, 0)) AS xp
      FROM dashboard_activity_log
      WHERE user_id = ? AND activity_type = 'xp_earned' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    [userId, Number(days)]
  );
}

async function getResourceUsage(userId) {
  return query(
    `
      SELECT r.type, COUNT(*) AS count
      FROM resource_views_log rvl
      INNER JOIN resources r ON r.id = rvl.resource_id
      WHERE rvl.user_id = ?
      GROUP BY r.type
    `,
    [userId]
  );
}

async function getTopicMasteryList(userId, order, limit = 3) {
  return query(
    `
      SELECT t.title AS topic, s.name AS subject, lp.progress_percent AS pct
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.user_id = ? AND lp.status != 'not_started'
      ORDER BY lp.progress_percent ${order === 'asc' ? 'ASC' : 'DESC'}
      LIMIT ?
    `,
    [userId, Number(limit)]
  );
}

module.exports = {
  getCompletionCounts,
  getStudyHoursThisWeek,
  getMasteryBySubject,
  getChatUsageBreakdown,
  getQuizPerformanceTrend,
  getXpOverTime,
  getResourceUsage,
  getTopicMasteryList,
};
