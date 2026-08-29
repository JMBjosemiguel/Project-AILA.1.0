const { query, execute } = require('../config/database');

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
    query("SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND last_login_at >= CURDATE()"),
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

async function listUsers({ search = '', role = 'all', status = 'all', sort = 'newest', limit = 20, offset = 0 }) {
  const orderBy = USER_SORT_MAP[sort] || USER_SORT_MAP.newest;
  const searchTerm = `%${search}%`;

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.student_number, u.is_active, u.created_at, u.last_login_at,
          r.name AS role, up.program, up.year_level, up.xp_points, up.level
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND (? = '' OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.student_number LIKE ?)
          AND (? = 'all' OR r.name = ?)
          AND (? = 'all' OR (? = 'active' AND u.is_active = 1) OR (? = 'inactive' AND u.is_active = 0))
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [search, searchTerm, searchTerm, searchTerm, searchTerm, role, role, status, status, status, limit, offset]
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
      `,
      [search, searchTerm, searchTerm, searchTerm, searchTerm, role, role, status, status, status]
    ),
  ]);

  return { rows, total: countRows[0].total };
}

async function getUserDetail(userId) {
  const rows = await query(
    `
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.student_number, u.is_active, u.created_at, u.last_login_at,
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

async function deleteUser(userId) {
  const result = await query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ? AND deleted_at IS NULL', [userId]);
  return result.affectedRows;
}

async function resetUserProgress(userId, connection) {
  await execute(connection, 'DELETE FROM lesson_progress WHERE user_id = ?', [userId]);
  await execute(connection, 'DELETE FROM learning_progress WHERE user_id = ?', [userId]);
  await execute(connection, 'DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
  await execute(connection, 'UPDATE learning_streaks SET current_streak = 0, longest_streak = 0, last_active_date = NULL WHERE user_id = ?', [userId]);
  await execute(connection, 'UPDATE user_profiles SET xp_points = 0, level = 1 WHERE user_id = ?', [userId]);
}

async function setUserActive(userId, isActive) {
  const result = await query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);
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
  listStudentUserIds,
  listUsers,
  getUserDetail,
  deleteUser,
  resetUserProgress,
  setUserActive,
  listResourcesAdmin,
  deleteResourceAdmin,
  setResourceArchived,
  listSubjectsAdmin,
  getSubjectOwner,
  setSubjectArchived,
};
