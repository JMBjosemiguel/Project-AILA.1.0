/**
 * Stateless password-reset token — a signed JWT, never a DB row (no schema
 * change). It carries a fingerprint (SHA-256, never the raw bcrypt hash) of
 * the user's password hash AT ISSUE TIME. Resetting the password compares
 * that fingerprint against the CURRENT hash: once the password actually
 * changes — via this reset, or any other path (e.g. Profile's change-
 * password) — every outstanding reset link for that user stops matching and
 * is rejected. That is the token's single-use guarantee; nothing needs to be
 * marked "used" anywhere.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PURPOSE = 'password_reset';
const RESET_TOKEN_TTL = '30m';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required.');
  }
  return secret;
}

function fingerprintPasswordHash(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash)).digest('hex');
}

function signPasswordResetToken(user) {
  return jwt.sign(
    { sub: user.id, purpose: PURPOSE, pwfp: fingerprintPasswordHash(user.password_hash) },
    getJwtSecret(),
    { expiresIn: RESET_TOKEN_TTL }
  );
}

// Throws jsonwebtoken's own TokenExpiredError / JsonWebTokenError on a bad
// signature or expiry, or a JsonWebTokenError-shaped error for the wrong
// purpose (e.g. a login token reused here) — the caller maps both to the
// same two outcomes verifyEmail already uses (TOKEN_EXPIRED / TOKEN_INVALID).
// Deliberately does NOT check the password-hash fingerprint — that needs the
// user's CURRENT hash, which only the caller has (see matchesCurrentPasswordHash).
function verifyPasswordResetToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.purpose !== PURPOSE) {
    const err = new Error('Not a password reset token.');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

function matchesCurrentPasswordHash(payload, currentPasswordHash) {
  return payload.pwfp === fingerprintPasswordHash(currentPasswordHash);
}

module.exports = {
  signPasswordResetToken,
  verifyPasswordResetToken,
  matchesCurrentPasswordHash,
};
