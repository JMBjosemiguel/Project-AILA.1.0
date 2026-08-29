const { query } = require('../config/database');

function buildWhere({ search = '', action = 'all', from = '', to = '' }) {
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

async function listAuditLog({ search = '', action = 'all', from = '', to = '', limit = 20, offset = 0 }) {
  const { whereClause, params } = buildWhere({ search, action, from, to });

  const [rows, countRows] = await Promise.all([
    query(
      `
        SELECT a.id, a.action, a.target_table, a.target_id, a.details, a.created_at,
          u.id AS admin_id, u.first_name, u.last_name
        FROM admin_audit_log a
        INNER JOIN users u ON u.id = a.admin_id
        WHERE ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM admin_audit_log a INNER JOIN users u ON u.id = a.admin_id WHERE ${whereClause}`, params),
  ]);

  return { rows, total: countRows[0].total };
}

async function listAuditLogForExport({ search = '', action = 'all', from = '', to = '' }) {
  const { whereClause, params } = buildWhere({ search, action, from, to });

  return query(
    `
      SELECT a.id, a.action, a.target_table, a.target_id, a.created_at,
        u.first_name, u.last_name, u.email
      FROM admin_audit_log a
      INNER JOIN users u ON u.id = a.admin_id
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
