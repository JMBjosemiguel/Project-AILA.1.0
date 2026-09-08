const crypto = require('crypto');

// A share token is 32 random bytes (256 bits) rendered URL-safe (base64url, no
// padding). The raw token is handed to the owner exactly once; only its SHA-256
// hash is persisted, so a database leak does not expose live share URLs.
function generateShareToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashShareToken(raw), hint: raw.slice(0, 8) };
}

function hashShareToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Tokens are opaque, ~43 chars of base64url. Reject anything that can't be one
// before touching the DB (also blocks path-y / enumeration probes).
function looksLikeShareToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(value);
}

module.exports = { generateShareToken, hashShareToken, looksLikeShareToken };
