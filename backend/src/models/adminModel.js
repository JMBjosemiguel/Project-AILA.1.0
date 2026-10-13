const { query, execute } = require('../config/database');
const { buildTombstoneEmail, buildTombstoneStudentNumber } = require('./userModel');
const { appStartOfDay, appDateStr } = require('../utils/appTime');
const { appWindowStart, windowStartDays, distinctCountByAppDay } = require('../utils/dayBucket');
const { WEAK_SCORE_THRESHOLD } = require('../constants/mastery');

const INACTIVITY_DAYS = 7;

async function getDashboardStats() {
  const [users, courses, resources, conversations, lessons, quizzes, attempts, feedback, activeToday] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND deleted_at IS NULL"),
    query('SELECT COUNT(*) AS count FROM subjects WHERE deleted_at IS NULL AND is_archived = 0'),
    query('SELECT COUNT(*) AS count FROM resources WHERE deleted_at IS NULL AND is_archived = 0'),
    query('SELECT COUNT(*) AS count FROM chat_conversations WHERE deleted_at IS NULL'),
    query('SELECT COUNT(*) AS count FROM lessons WHERE deleted_at IS NULL'),
    query('SELECT COUNT(*) AS count FROM quizzes'),
    query('SELECT COUNT(*) AS count FROM quiz_attempts'),
    query('SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS count FROM feedback WHERE rating IS NOT NULL AND deleted_at IS NULL'),
    // "Today" means the application timezone's calendar day (APP_TIMEZONE),
    // not MySQL's own session date (CURDATE() depends on the connection's
    // session time_zone, which is UTC as of the earlier timezone fix — a
    // different boundary than APP_TIMEZONE whenever they're not the same zone).
    query('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND last_login_at >= ?', [appStartOfDay()]),
  ]);

  return {
    totalStudents: users[0].count,
    totalCourses: courses[0].count,
    totalResources: resources[0].count,
    totalConversations: conversations[0].count,
    totalLessons: lessons[0].count,
    totalQuizzes: quizzes[0].count,
    totalQuizAttempts: attempts[0].count,
    avgFeedbackRating: feedback[0].avg_rating,
    totalFeedback: feedback[0].count,
    activeUsersToday: activeToday[0].count,
  };
}

async function getRecentActivity(limit = 8) {
  const perFeedLimit = limit;
  const [registrations, courses, uploads, quizCompletions, feedback, deletions] = await Promise.all([
    query(
      `SELECT id, first_name, last_name, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`,
      [perFeedLimit]
    ),
    query(
      `
        SELECT s.id, s.name, s.created_at, u.first_name, u.last_name
        FROM subjects s
        LEFT JOIN users u ON u.id = s.created_by
        WHERE s.deleted_at IS NULL AND s.is_ai_generated = 1
        ORDER BY s.created_at DESC LIMIT ?
      `,
      [perFeedLimit]
    ),
    query(
      `
        SELECT r.id, r.title, r.created_at, u.first_name, u.last_name
        FROM resources r
        LEFT JOIN users u ON u.id = r.uploaded_by
        WHERE r.deleted_at IS NULL
        ORDER BY r.created_at DESC LIMIT ?
      `,
      [perFeedLimit]
    ),
    query(
      `
        SELECT qa.id, qa.score, qa.total, qa.completed_at, q.topic, u.first_name, u.last_name
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        INNER JOIN users u ON u.id = qa.user_id
        WHERE qa.completed_at IS NOT NULL
        ORDER BY qa.completed_at DESC LIMIT ?
      `,
      [perFeedLimit]
    ),
    query(
      `
        SELECT f.id, f.rating, f.created_at, u.first_name, u.last_name
        FROM feedback f
        INNER JOIN users u ON u.id = f.user_id
        WHERE f.deleted_at IS NULL
        ORDER BY f.created_at DESC LIMIT ?
      `,
      [perFeedLimit]
    ),
    query(
      `
        SELECT l.id, l.action, l.target_table, l.target_id, l.created_at, u.first_name, u.last_name
        FROM admin_audit_log l
        INNER JOIN users u ON u.id = l.admin_id
        WHERE l.action LIKE '%.delete'
        ORDER BY l.created_at DESC LIMIT ?
      `,
      [perFeedLimit]
    ),
  ]);

  return { registrations, courses, uploads, quizCompletions, feedback, deletions };
}

async function getFeedbackPendingCount() {
  const rows = await query("SELECT COUNT(*) AS count FROM feedback WHERE status = 'pending' AND deleted_at IS NULL");
  return rows[0].count;
}

async function getUnverifiedOver24hCount() {
  const rows = await query(
    "SELECT COUNT(*) AS count FROM users WHERE email_verified_at IS NULL AND deleted_at IS NULL AND created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
  );
  return rows[0].count;
}

// Active, verified students who may need a nudge: no learning activity in
// the last INACTIVITY_DAYS days (learning_streaks.last_active_date, the same
// signal the student-facing streak feature already treats as "last day this
// student did something that counts"), or a weak recent quiz average (same
// last-10-submitted-attempts window as studentContextService.getRecentQuizAverage,
// just computed for every student at once instead of one at a time).
// Returns up to `limit` students plus the true total so the dashboard's
// "needs attention" count isn't silently capped at the display limit.
async function getStudentsNeedingHelp(limit = 5) {
  const cutoffDate = appDateStr(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

  const [inactive, lowScoring] = await Promise.all([
    query(
      `
        SELECT u.id, u.first_name, u.last_name, ls.last_active_date
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id AND r.name = 'student'
        LEFT JOIN learning_streaks ls ON ls.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.is_active = 1 AND u.email_verified_at IS NOT NULL
          AND (ls.last_active_date IS NULL OR ls.last_active_date < ?)
        ORDER BY (ls.last_active_date IS NULL) DESC, ls.last_active_date ASC
      `,
      [cutoffDate]
    ),
    query(
      `
        SELECT u.id, u.first_name, u.last_name, ranked.avg_percent
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id AND r.name = 'student'
        INNER JOIN (
          SELECT user_id, ROUND(AVG(pct) * 100, 0) AS avg_percent
          FROM (
            SELECT qa.user_id, qa.score / qa.total AS pct,
              ROW_NUMBER() OVER (PARTITION BY qa.user_id ORDER BY qa.completed_at DESC) AS rn
            FROM quiz_attempts qa
            WHERE qa.status = 'submitted' AND qa.total > 0
          ) recent
          WHERE rn <= 10
          GROUP BY user_id
          HAVING avg_percent < ?
        ) ranked ON ranked.user_id = u.id
        WHERE u.deleted_at IS NULL AND u.is_active = 1 AND u.email_verified_at IS NOT NULL
        ORDER BY ranked.avg_percent ASC
      `,
      [WEAK_SCORE_THRESHOLD]
    ),
  ]);

  const byId = new Map();
  for (const row of inactive) {
    const days = row.last_active_date
      ? Math.floor((Date.now() - new Date(row.last_active_date).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    byId.set(row.id, {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      reason: days === null ? 'No learning activity recorded yet' : `No activity for ${days} days`,
    });
  }
  for (const row of lowScoring) {
    // Inactivity is the more fundamental signal — don't overwrite it with the
    // low-score reason if a student already qualifies both ways.
    if (byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      reason: `Recent quiz average ${row.avg_percent}%`,
    });
  }

  const all = Array.from(byId.values());
  return { total: all.length, students: all.slice(0, limit) };
}

// Distinct active students per APP_TIMEZONE calendar day, last `days` days,
// zero-filled. "Active" = any dashboard_activity_log event (lesson/quiz/task
// completion, resource views, XP, streaks) — the broadest existing signal of
// "this student did something," not just the 3 learning-completion types the
// student dashboard's own weekly chart filters to.
async function getActiveStudentsByDay(days = 7) {
  const rows = await query(
    `
      SELECT dal.user_id, dal.created_at AS ts
      FROM dashboard_activity_log dal
      INNER JOIN users u ON u.id = dal.user_id
      WHERE dal.created_at >= ? AND u.deleted_at IS NULL
    `,
    [appWindowStart(days - 1)]
  );
  const validDays = windowStartDays(days);
  const counted = distinctCountByAppDay(rows, 'ts', 'user_id');
  const countByDate = new Map(counted.map((row) => [row.date, row.count]));
  return validDays.map((date) => ({ date, count: countByDate.get(date) || 0 }));
}

async function listStudentUserIds() {
  const rows = await query(
    "SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND deleted_at IS NULL AND is_active = 1"
  );
  return rows.map((row) => row.id);
}

const USER_SORT_MAP = {
  newest: 'u.created_at DESC',
  oldest: 'u.created_at ASC',
  name: 'u.first_name ASC, u.last_name ASC',
  last_login: 'u.last_login_at DESC',
};

async function listUsers({ search = '', role = 'all', status = 'all', verification = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = USER_SORT_MAP[sort] || USER_SORT_MAP.newest;
  const searchTerm = `%${search}%`;

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.student_number, u.is_active, u.email_verified_at, u.created_at, u.last_login_at,
          r.name AS role, up.program, up.year_level, up.xp_points, up.level
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND (? = '' OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.student_number LIKE ?)
          AND (? = 'all' OR r.name = ?)
          AND (? = 'all' OR (? = 'active' AND u.is_active = 1) OR (? = 'inactive' AND u.is_active = 0))
          AND (? = 'all' OR (? = 'verified' AND u.email_verified_at IS NOT NULL) OR (? = 'pending' AND u.email_verified_at IS NULL))
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [search, searchTerm, searchTerm, searchTerm, searchTerm, role, role, status, status, status, verification, verification, verification, limit, offset]
    ),
    query(
      `
        SELECT COUNT(*) AS total
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.deleted_at IS NULL
          AND (? = '' OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.student_number LIKE ?)
          AND (? = 'all' OR r.name = ?)
          AND (? = 'all' OR (? = 'active' AND u.is_active = 1) OR (? = 'inactive' AND u.is_active = 0))
          AND (? = 'all' OR (? = 'verified' AND u.email_verified_at IS NOT NULL) OR (? = 'pending' AND u.email_verified_at IS NULL))
      `,
      [search, searchTerm, searchTerm, searchTerm, searchTerm, role, role, status, status, status, verification, verification, verification]
    ),
  ]);

  return { rows, total: countRows[0].total };
}

async function getUserDetail(userId) {
  const rows = await query(
    `
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.student_number, u.is_active, u.email_verified_at, u.created_at, u.last_login_at,
        r.name AS role, up.program, up.year_level, up.bio, up.xp_points, up.level
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;

  const [courses, lessonsCompleted, resources, quizAverage, streak, storage, activity, conversations] = await Promise.all([
    query('SELECT COUNT(*) AS count FROM subjects WHERE created_by = ? AND deleted_at IS NULL', [userId]),
    query('SELECT COUNT(*) AS count FROM lesson_progress WHERE user_id = ?', [userId]),
    query('SELECT COUNT(*) AS count FROM resources WHERE uploaded_by = ? AND deleted_at IS NULL', [userId]),
    query('SELECT ROUND(AVG(score / total) * 100, 0) AS avg_percent FROM quiz_attempts WHERE user_id = ? AND total > 0', [userId]),
    query('SELECT current_streak, longest_streak FROM learning_streaks WHERE user_id = ? LIMIT 1', [userId]),
    query('SELECT COALESCE(SUM(file_size_bytes), 0) AS bytes FROM resources WHERE uploaded_by = ? AND deleted_at IS NULL', [userId]),
    query('SELECT id, activity_type, description, created_at FROM dashboard_activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]),
    query(
      `
        SELECT c.id, c.title, c.started_at, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
        FROM chat_conversations c
        WHERE c.user_id = ? AND c.deleted_at IS NULL
        ORDER BY c.started_at DESC LIMIT 5
      `,
      [userId]
    ),
  ]);

  return {
    ...user,
    coursesGenerated: courses[0].count,
    lessonsCompleted: lessonsCompleted[0].count,
    resourcesUploaded: resources[0].count,
    quizAverage: quizAverage[0].avg_percent,
    streak: streak[0] || { current_streak: 0, longest_streak: 0 },
    storageBytes: storage[0].bytes,
    recentActivity: activity,
    recentConversations: conversations,
  };
}

// Soft delete: marks the row deleted/inactive AND releases its unique
// email/student_number (tombstoned to an unreachable, irreversible value) in
// the same atomic UPDATE, so a genuinely new student can register with that
// same identity afterward without an admin having to touch the database.
// The row itself, its id, and every historical child-table relationship
// (chats, quizzes, XP, resources, ...) are untouched — nothing is deleted
// except the identity fields, and the account is never reactivated.
async function deleteUser(userId, connection = null) {
  const result = await execute(
    connection,
    `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP,
          is_active = 0,
          email = ?,
          student_number = CASE WHEN student_number IS NOT NULL THEN ? ELSE NULL END
      WHERE id = ? AND deleted_at IS NULL
    `,
    [buildTombstoneEmail(userId), buildTombstoneStudentNumber(userId), userId]
  );
  return result.affectedRows;
}

// Role + active status for the target of a delete/deactivate, locked for the
// duration of the caller's transaction (FOR UPDATE) so a concurrent request
// against the SAME row can't race past the guard below it. Mirrors
// getUserForPromotion's shape; kept separate since promotion's eligibility
// checks are unrelated to delete/deactivate's "last admin" guard.
async function getUserForDeletion(userId, connection) {
  const rows = await execute(
    connection,
    `
      SELECT u.id, u.is_active, r.name AS role
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );
  return rows[0] || null;
}

// Must be called inside the SAME transaction as the delete/deactivate it is
// guarding. FOR UPDATE here locks every row counted as an active admin, not
// just one — so two concurrent requests targeting two DIFFERENT admins (e.g.
// "delete admin X" and "delete admin Y" at the same moment, with only X and Y
// left) still serialize against each other instead of both reading "2 active
// admins, safe to proceed" and leaving zero.
async function countActiveAdmins(connection) {
  const rows = await execute(
    connection,
    `
      SELECT COUNT(*) AS count
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.deleted_at IS NULL AND u.is_active = 1
      FOR UPDATE
    `
  );
  return Number(rows[0].count);
}

async function resetUserProgress(userId, connection) {
  await execute(connection, 'DELETE FROM lesson_progress WHERE user_id = ?', [userId]);
  await execute(connection, 'DELETE FROM learning_progress WHERE user_id = ?', [userId]);
  await execute(connection, 'DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
  await execute(connection, 'UPDATE learning_streaks SET current_streak = 0, longest_streak = 0, last_active_date = NULL WHERE user_id = ?', [userId]);
  await execute(connection, 'UPDATE user_profiles SET xp_points = 0, level = 1 WHERE user_id = ?', [userId]);
}

async function setUserActive(userId, isActive, connection = null) {
  const result = await execute(connection, 'UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);
  return result.affectedRows;
}

// Role + status fields the promotion eligibility checks need — the same
// shape getUserDetail already reads, just without the dashboard extras.
async function getUserForPromotion(userId) {
  const rows = await query(
    `
      SELECT u.id, u.is_active, u.email_verified_at, r.name AS role
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

// Resource visibility hardcodes role_id = 2 (admin) in several places
// (resourceModel.js, learningModel.js) to show every admin's uploads to
// every student — so promoting a student with personal uploads would make
// those uploads visible to the whole student body. The caller blocks the
// promotion while this is non-zero.
async function countPersonalUploads(userId) {
  const rows = await query('SELECT COUNT(*) AS count FROM resources WHERE uploaded_by = ? AND deleted_at IS NULL', [userId]);
  return rows[0].count;
}

async function promoteToAdmin(userId) {
  const result = await query(
    `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin') WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return result.affectedRows;
}

const RESOURCE_SORT_MAP = {
  newest: 'r.created_at DESC',
  oldest: 'r.created_at ASC',
  title: 'r.title ASC',
  size: 'r.file_size_bytes DESC',
};

async function listResourcesAdmin({ search = '', type = 'all', archived = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = RESOURCE_SORT_MAP[sort] || RESOURCE_SORT_MAP.newest;
  const searchTerm = `%${search}%`;

  const whereClause = `
    r.deleted_at IS NULL
      AND (? = '' OR r.title LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)
      AND (? = 'all' OR r.type = ?)
      AND (? = 'all' OR (? = 'archived' AND r.is_archived = 1) OR (? = 'active' AND r.is_archived = 0))
  `;
  const whereParams = [search, searchTerm, searchTerm, searchTerm, type, type, archived, archived, archived];

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          r.id, r.title, r.type, r.file_path, r.external_url, r.ai_analyzed_at, r.ai_summary, r.ai_keywords,
          r.ai_topic, r.ai_difficulty, r.file_size_bytes, r.is_archived, r.created_at,
          u.id AS uploaded_by, u.first_name, u.last_name,
          (SELECT COUNT(*) FROM resource_views_log rvl WHERE rvl.resource_id = r.id) AS view_count,
          (SELECT MAX(rvl.viewed_at) FROM resource_views_log rvl WHERE rvl.resource_id = r.id) AS last_accessed_at,
          (SELECT s.name FROM resource_subjects rs INNER JOIN subjects s ON s.id = rs.subject_id WHERE rs.resource_id = r.id LIMIT 1) AS course_name
        FROM resources r
        LEFT JOIN users u ON u.id = r.uploaded_by
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM resources r LEFT JOIN users u ON u.id = r.uploaded_by WHERE ${whereClause}`, whereParams),
  ]);

  return { rows, total: countRows[0].total };
}

async function deleteResourceAdmin(resourceId) {
  const rows = await query('SELECT file_path FROM resources WHERE id = ? AND deleted_at IS NULL LIMIT 1', [resourceId]);
  if (!rows.length) return null;

  await query('UPDATE resources SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [resourceId]);
  return rows[0].file_path;
}

async function setResourceArchived(resourceId, isArchived) {
  const result = await query('UPDATE resources SET is_archived = ? WHERE id = ? AND deleted_at IS NULL', [isArchived ? 1 : 0, resourceId]);
  return result.affectedRows;
}

const COURSE_SORT_MAP = {
  newest: 's.created_at DESC',
  oldest: 's.created_at ASC',
  name: 's.name ASC',
};

async function listSubjectsAdmin({ search = '', archived = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = COURSE_SORT_MAP[sort] || COURSE_SORT_MAP.newest;
  const searchTerm = `%${search}%`;

  const whereClause = `
    s.deleted_at IS NULL
      AND (? = '' OR s.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)
      AND (? = 'all' OR (? = 'archived' AND s.is_archived = 1) OR (? = 'active' AND s.is_archived = 0))
  `;
  const whereParams = [search, searchTerm, searchTerm, searchTerm, archived, archived, archived];

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          s.id, s.name, s.code, s.difficulty, s.goal, s.is_ai_generated, s.is_archived, s.created_at,
          u.id AS owner_id, u.first_name, u.last_name,
          (SELECT COUNT(*) FROM modules m WHERE m.subject_id = s.id AND m.deleted_at IS NULL) AS module_count,
          (
            SELECT COUNT(*) FROM lessons l
            INNER JOIN topics t ON t.id = l.topic_id
            INNER JOIN modules m ON m.id = t.module_id
            WHERE m.subject_id = s.id AND l.deleted_at IS NULL AND t.deleted_at IS NULL
          ) AS lesson_count,
          (
            SELECT ROUND(COUNT(CASE WHEN lpr.completed_at IS NOT NULL THEN 1 END) / COUNT(*) * 100)
            FROM lessons l
            INNER JOIN topics t ON t.id = l.topic_id
            INNER JOIN modules m ON m.id = t.module_id
            LEFT JOIN lesson_progress lpr ON lpr.lesson_id = l.id AND lpr.user_id = s.created_by
            WHERE m.subject_id = s.id AND l.deleted_at IS NULL AND t.deleted_at IS NULL
          ) AS completion_rate,
          (
            SELECT ROUND(AVG(qa.score / qa.total * 100))
            FROM quiz_attempts qa
            INNER JOIN quizzes q ON q.id = qa.quiz_id
            WHERE qa.completed_at IS NOT NULL AND qa.user_id = s.created_by
              AND (
                (q.source_type = 'topic' AND q.source_id IN (SELECT t.id FROM topics t INNER JOIN modules m ON m.id = t.module_id WHERE m.subject_id = s.id))
                OR (q.source_type = 'lesson' AND q.source_id IN (SELECT l.id FROM lessons l INNER JOIN topics t ON t.id = l.topic_id INNER JOIN modules m ON m.id = t.module_id WHERE m.subject_id = s.id))
              )
          ) AS avg_quiz_score
        FROM subjects s
        LEFT JOIN users u ON u.id = s.created_by
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...whereParams, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM subjects s LEFT JOIN users u ON u.id = s.created_by WHERE ${whereClause}`, whereParams),
  ]);

  return { rows, total: countRows[0].total };
}

async function getSubjectOwner(subjectId) {
  const rows = await query('SELECT created_by FROM subjects WHERE id = ? AND deleted_at IS NULL LIMIT 1', [subjectId]);
  return rows[0]?.created_by ?? null;
}

async function setSubjectArchived(subjectId, isArchived) {
  const result = await query('UPDATE subjects SET is_archived = ? WHERE id = ? AND deleted_at IS NULL', [isArchived ? 1 : 0, subjectId]);
  return result.affectedRows;
}

module.exports = {
  getDashboardStats,
  getRecentActivity,
  getFeedbackPendingCount,
  getUnverifiedOver24hCount,
  getStudentsNeedingHelp,
  getActiveStudentsByDay,
  listStudentUserIds,
  listUsers,
  getUserDetail,
  deleteUser,
  resetUserProgress,
  setUserActive,
  getUserForPromotion,
  getUserForDeletion,
  countActiveAdmins,
  countPersonalUploads,
  promoteToAdmin,
  listResourcesAdmin,
  deleteResourceAdmin,
  setResourceArchived,
  listSubjectsAdmin,
  getSubjectOwner,
  setSubjectArchived,
};
