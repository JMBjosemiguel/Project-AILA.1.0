const { execute } = require('../config/database');

async function logAdminAction(adminId, action, targetTable, targetId = null, details = null, connection = null) {
  await execute(
    connection,
    'INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, action, targetTable, targetId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logAdminAction };
