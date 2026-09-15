const { query, execute } = require('../config/database');

// Supersede: any of this user's still-active (unused) tokens stop working the
// moment a new one is issued, so only the newest emailed link is ever valid.
async function invalidateActiveTokens(userId, connection = null) {
  await execute(
    connection,
    'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL',
    [userId]
  );
}

async function createToken({ userId, tokenHash, expiresAt }, connection = null) {
  const result = await execute(
    connection,
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );
  return result.insertId;
}

// FOR UPDATE inside the caller's transaction — serializes two concurrent
// verify attempts on the same token so only one can consume it.
async function findTokenByHashForUpdate(tokenHash, connection) {
  const rows = await execute(
    connection,
    'SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE',
    [tokenHash]
  );
  return rows[0] || null;
}

async function markTokenUsed(tokenId, connection) {
  await execute(connection, 'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [tokenId]);
}

async function markUserVerified(userId, connection = null) {
  await execute(connection, 'UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
}

// Best-effort cleanup hook (not wired to a scheduler — no cron infra in this
// app — but available for an admin/maintenance script): drop tokens that can
// never be used again.
async function deleteExpiredAndUsedTokens() {
  const result = await query(
    'DELETE FROM email_verification_tokens WHERE used_at IS NOT NULL OR expires_at < CURRENT_TIMESTAMP'
  );
  return result.affectedRows;
}

module.exports = {
  invalidateActiveTokens,
  createToken,
  findTokenByHashForUpdate,
  markTokenUsed,
  markUserVerified,
  deleteExpiredAndUsedTokens,
};
