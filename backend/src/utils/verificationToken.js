const crypto = require('crypto');

// Same shape as utils/shareToken.js: 32 random bytes (256 bits), URL-safe
// base64url. The raw token is emailed to the student exactly once; only its
// SHA-256 hash is persisted, so a database leak never exposes a usable link.
function generateVerificationToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashVerificationToken(raw) };
}

function hashVerificationToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Opaque, ~43 chars of base64url. Reject anything that can't be one before it
// ever touches the DB.
function looksLikeVerificationToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(value);
}

module.exports = { generateVerificationToken, hashVerificationToken, looksLikeVerificationToken };
