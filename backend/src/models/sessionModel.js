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

// Ends every active session for a user — used after a password reset so
// every existing login (on any device) is forced to sign in again with the
// new password. authenticate() rejects a request whose session row no
// longer exists (see middlewares/authenticate.js), so this takes effect on
// each of those sessions' very next request, no token blocklist needed.
async function deleteAllSessionsForUser(userId) {
  await query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
}

module.exports = {
  createSession,
  findActiveSessionById,
  deleteSession,
  deleteAllSessionsForUser,
};
