const { query } = require('../config/database');
const { appWindowStart, windowStartDays, sumByAppDay, avgPercentByAppDay } = require('../utils/dayBucket');

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
  const rows = await query(
    `
      SELECT started_at AS ts, COALESCE(duration_minutes, 0) AS minutes
      FROM study_sessions
      WHERE user_id = ? AND started_at >= ?
    `,
    [userId, appWindowStart(6)]
  );
  const validDays = new Set(windowStartDays(7));
  return sumByAppDay(rows, 'ts', 'minutes')
    .filter((row) => validDays.has(row.date))
    .map((row) => ({ date: row.date, hours: Math.round((row.value / 60) * 10) / 10 }));
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
  // Ordered DESC with a row cap (not a SQL-side GROUP BY) so re-bucketing by
  // APP_TIMEZONE below can pick the most recent 14 distinct calendar days —
  // the old `GROUP BY DATE(...) ORDER BY date ASC LIMIT 14` picked the
  // EARLIEST 14 days of all-time history, which for any account with more
  // than 14 days of quiz activity silently stayed stuck showing ancient data.
  const rows = await query(
    `
      SELECT completed_at AS ts, score, total
      FROM quiz_attempts
      WHERE user_id = ? AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1000
    `,
    [userId]
  );
  return avgPercentByAppDay(rows).slice(-14);
}

async function getXpOverTime(userId, days = 14) {
  const rows = await query(
    `
      SELECT created_at AS ts, COALESCE(reference_id, 0) AS xp
      FROM dashboard_activity_log
      WHERE user_id = ? AND activity_type = 'xp_earned' AND created_at >= ?
    `,
    [userId, appWindowStart(Number(days) - 1)]
  );
  const validDays = new Set(windowStartDays(Number(days)));
  return sumByAppDay(rows, 'ts', 'xp')
    .filter((row) => validDays.has(row.date))
    .map((row) => ({ date: row.date, xp: row.value }));
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

// Every topic the student has started, ranked highest mastery first. The
// service splits this single ranked list into "strong" and "weak" topics so
// the same topic can never land in both — two independent DESC/ASC queries
// (the old approach) return the SAME topics whenever there are only a
// handful of in-progress topics, which is exactly the "strong and weak show
// identical topics" bug.
async function getTopicMasteryRanked(userId) {
  return query(
    `
      SELECT t.title AS topic, s.name AS subject, lp.progress_percent AS pct
      FROM learning_progress lp
      INNER JOIN topics t ON t.id = lp.topic_id
      INNER JOIN modules m ON m.id = t.module_id
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE lp.user_id = ? AND lp.status != 'not_started'
      ORDER BY lp.progress_percent DESC
    `,
    [userId]
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
  getTopicMasteryRanked,
};
