const { query } = require('../config/database');

async function createSession(userId, deviceInfo, ipAddress, connection = null) {
  const executor = connection || { execute: query };

  if (connection) {
    const [result] = await executor.execute(
      `
        INSERT INTO user_sessions (user_id, device_info, ip_address, last_active_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [userId, deviceInfo || null, ipAddress || null]
    );
    return result.insertId;
  }

  const result = await query(
    `
      INSERT INTO user_sessions (user_id, device_info, ip_address, last_active_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [userId, deviceInfo || null, ipAddress || null]
  );
  return result.insertId;
}

async function findActiveSessionById(sessionId, userId) {
  const rows = await query(
    `
      SELECT id, user_id, device_info, ip_address, last_active_at, created_at
      FROM user_sessions
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [sessionId, userId]
  );

  return rows[0] || null;
}

async function deleteSession(sessionId, userId) {
  await query('DELETE FROM user_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
}

module.exports = {
  createSession,
  findActiveSessionById,
  deleteSession,
};
