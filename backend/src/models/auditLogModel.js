const { query } = require('../config/database');

// Read-time lookup of a human-readable name for the row an audit entry
// targeted. One LEFT JOIN per target_table currently passed to
// logAdminAction (see every call site of that function) — each gated on
// a.target_table so a target_id can never match the wrong table. Tables
// with no name-like column (e.g. feedback) fall through to NULL, and the
// caller falls back to "Table #id". No schema changes; nothing written.
const TARGET_NAME_JOINS = `
  LEFT JOIN users tu ON a.target_table = 'users' AND tu.id = a.target_id
  LEFT JOIN resources tr ON a.target_table = 'resources' AND tr.id = a.target_id
  LEFT JOIN chat_conversations tc ON a.target_table = 'chat_conversations' AND tc.id = a.target_id
  LEFT JOIN subjects ts ON a.target_table = 'subjects' AND ts.id = a.target_id
  LEFT JOIN notifications tn ON a.target_table = 'notifications' AND tn.id = a.target_id
  LEFT JOIN quiz_attempts tqa ON a.target_table = 'quiz_attempts' AND tqa.id = a.target_id
  LEFT JOIN quizzes tq ON tq.id = tqa.quiz_id
`;

const TARGET_NAME_SELECT = `
  CASE a.target_table
    WHEN 'users' THEN CONCAT(tu.first_name, ' ', tu.last_name)
    WHEN 'resources' THEN tr.title
    WHEN 'chat_conversations' THEN tc.title
    WHEN 'subjects' THEN ts.name
    WHEN 'notifications' THEN tn.title
    WHEN 'quiz_attempts' THEN tq.topic
    ELSE NULL
  END AS target_name
`;

function buildWhere({ search = '', action = 'all', role = 'all', from = '', to = '' }) {
  const conditions = ['1=1'];
  const params = [];

  if (search) {
    conditions.push('(a.action LIKE ? OR a.target_table LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (action !== 'all') {
    conditions.push('a.action = ?');
    params.push(action);
  }
  if (role === 'admin' || role === 'student') {
    conditions.push('r.name = ?');
    params.push(role);
  }
  if (from) {
    conditions.push('a.created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('a.created_at <= ?');
    params.push(to);
  }

  return { whereClause: conditions.join(' AND '), params };
}

async function listAuditLog({ search = '', action = 'all', role = 'all', from = '', to = '', limit = 20, offset = 0 }) {
  const { whereClause, params } = buildWhere({ search, action, role, from, to });

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT a.id, a.action, a.target_table, a.target_id, a.details, a.created_at,
          u.id AS admin_id, u.first_name, u.last_name, r.name AS role,
          ${TARGET_NAME_SELECT}
        FROM admin_audit_log a
        INNER JOIN users u ON u.id = a.admin_id
        INNER JOIN roles r ON r.id = u.role_id
        ${TARGET_NAME_JOINS}
        WHERE ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*) AS total FROM admin_audit_log a
        INNER JOIN users u ON u.id = a.admin_id
        INNER JOIN roles r ON r.id = u.role_id
       WHERE ${whereClause}`,
      params
    ),
  ]);

  return { rows, total: countRows[0].total };
}

async function listAuditLogForExport({ search = '', action = 'all', role = 'all', from = '', to = '' }) {
  const { whereClause, params } = buildWhere({ search, action, role, from, to });

  return query(
    `
      SELECT a.id, a.action, a.target_table, a.target_id, a.created_at,
        u.first_name, u.last_name, u.email, r.name AS role,
        ${TARGET_NAME_SELECT}
      FROM admin_audit_log a
      INNER JOIN users u ON u.id = a.admin_id
      INNER JOIN roles r ON r.id = u.role_id
      ${TARGET_NAME_JOINS}
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT 5000
    `,
    params
  );
}

async function listDistinctActions() {
  const rows = await query('SELECT DISTINCT action FROM admin_audit_log ORDER BY action ASC');
  return rows.map((row) => row.action);
}

module.exports = {
  listAuditLog,
  listAuditLogForExport,
  listDistinctActions,
};
