'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { db, api, serverReachable, purgeByTag } = require('./helpers');

const authService = require('../../src/services/authService');
const { transaction } = require('../../src/config/database');
const { generateVerificationToken } = require('../../src/utils/verificationToken');

const TAG = `qa.itest.verify.${Date.now()}`;
let n = 0;
function nextEmail() {
  n += 1;
  return `${TAG}.${n}@example.com`;
}

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function registerRaw(email, extra = {}) {
  return api('POST', '/auth/register', {
    body: {
      first_name: 'ITest',
      last_name: 'Verify',
      email,
      password: 'ItestPassw0rd!',
      ...extra,
    },
  });
}

async function activeTokenRow(userId) {
  const rows = await db.query(
    'SELECT id, token_hash, expires_at, used_at FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

// Mirrors issueVerificationToken(): expiry/used-at are computed as JS Date
// objects and passed as params (not SQL NOW()/DATE_ADD — the pool is
// configured `timezone: 'Z'` so parameterized Date values round-trip
// correctly, but the server's own NOW() runs in its local session zone and
// would skew hours off from Date.now() if used directly).
// Wrapped in transaction() (not two bare db.query calls) so this gets the
// same ER_LOCK_DEADLOCK auto-retry the app itself relies on under concurrent
// load — the integration suite runs many test files against the DB at once.
async function insertToken(userId, hash, { expiresAt, usedAt = null } = {}) {
  return transaction(async (connection) => {
    await connection.execute(
      'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );
    await connection.execute(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?)',
      [userId, hash, expiresAt, usedAt]
    );
  });
}

test('email verification', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }
  if (!(await serverReachable())) { t.skip('local backend not reachable (npm run dev)'); return; }

  t.after(async () => {
    await purgeByTag(TAG);
    await db.query('DELETE FROM users WHERE email LIKE ?', [`${TAG}%`]).catch(() => {});
    await db.pool.end();
  });

  await t.test('register creates an UNVERIFIED account and a hashed token, never the raw token', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    assert.equal(reg.status, 201);
    assert.equal(reg.json.data.user.email_verified, false);

    const row = (await db.query('SELECT email_verified_at FROM users WHERE id = ?', [reg.json.data.user.id]))[0];
    assert.equal(row.email_verified_at, null);

    const tokenRow = await activeTokenRow(reg.json.data.user.id);
    assert.ok(tokenRow, 'a verification token was issued');
    assert.equal(tokenRow.token_hash.length, 64, 'sha256 hex hash');
    assert.ok(!JSON.stringify(reg.json).includes(tokenRow.token_hash), 'hash is never returned to the client');
  });

  await t.test('login is blocked before verification with a friendly 403, then succeeds after', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const password = 'ItestPassw0rd!';

    const blocked = await api('POST', '/auth/login', { body: { email, password } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.details?.code, 'EMAIL_NOT_VERIFIED');
    assert.match(blocked.json.message, /verify your email/i);

    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [reg.json.data.user.id]);

    const ok = await api('POST', '/auth/login', { body: { email, password } });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.data.token);
  });

  await t.test('a wrong password on an unverified account still says "invalid email or password" (no enumeration)', async () => {
    const email = nextEmail();
    await registerRaw(email);
    const res = await api('POST', '/auth/login', { body: { email, password: 'TotallyWrong123!' } });
    assert.equal(res.status, 401);
    assert.doesNotMatch(res.json.message, /verify/i);
  });

  await t.test('verifyEmail: valid token verifies the account exactly once', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const userId = reg.json.data.user.id;

    // The raw token is only ever known transiently (emailed, never persisted),
    // so mint one the same way the app does and store its hash directly —
    // this mirrors exactly what clicking the emailed link would send us.
    const { raw, hash } = generateVerificationToken();
    await insertToken(userId, hash, { expiresAt: new Date(Date.now() + 30 * 60 * 1000) });

    const verify = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(verify.status, 200);
    assert.equal(verify.json.data.alreadyVerified, false);
    assert.equal(verify.json.message, 'Email verified successfully.');

    const row = (await db.query('SELECT email_verified_at FROM users WHERE id = ?', [userId]))[0];
    assert.ok(row.email_verified_at, 'user is now verified');

    // Reusing the same token afterwards: the user is now verified, so this
    // takes the friendly "already verified" branch (verified-user status is
    // checked before token state) rather than a TOKEN_USED error.
    const reuse = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(reuse.status, 200);
    assert.equal(reuse.json.data.alreadyVerified, true);
  });

  await t.test('verifyEmail: a token superseded before ever being consumed reports TOKEN_USED', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const userId = reg.json.data.user.id;

    // A still-unverified user's old (superseded) token carries used_at even
    // though it was never actually consumed by a successful verify.
    const { raw, hash } = generateVerificationToken();
    await insertToken(userId, hash, { expiresAt: new Date(Date.now() + 30 * 60 * 1000), usedAt: new Date() });

    const res = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(res.status, 400);
    assert.equal(res.json.details?.code, 'TOKEN_USED');
  });

  await t.test('verifyEmail: invalid / garbage tokens are rejected', async () => {
    for (const bad of ['not-a-real-token-xxxxxxxxxx', crypto.randomBytes(24).toString('base64url')]) {
      const res = await api('POST', '/auth/verify-email', { body: { token: bad } });
      assert.equal(res.status, 400);
      assert.equal(res.json.details?.code, 'TOKEN_INVALID');
    }
  });

  await t.test('verifyEmail: expired token is rejected with TOKEN_EXPIRED (410)', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const userId = reg.json.data.user.id;

    const { raw, hash } = generateVerificationToken();
    await insertToken(userId, hash, { expiresAt: new Date(Date.now() - 60 * 1000) });

    const res = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(res.status, 410);
    assert.equal(res.json.details?.code, 'TOKEN_EXPIRED');
  });

  await t.test('verifyEmail: an already-verified user gets a friendly 200, even with a stale/invalid token', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const userId = reg.json.data.user.id;
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);

    const { raw, hash } = generateVerificationToken();
    await insertToken(userId, hash, { expiresAt: new Date(Date.now() + 30 * 60 * 1000), usedAt: new Date() });

    const res = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.alreadyVerified, true);
  });

  await t.test('generating a new token supersedes the previous active one', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const userId = reg.json.data.user.id;
    const first = await activeTokenRow(userId);

    await authService.resendVerification(email);

    const rows = await db.query('SELECT id, used_at FROM email_verification_tokens WHERE user_id = ? ORDER BY id', [userId]);
    assert.equal(rows.length, 2, 'old token kept for audit, new one issued');
    const oldRow = rows.find((r) => r.id === first.id);
    assert.ok(oldRow.used_at, 'the superseded token is marked used and can no longer verify');
    assert.equal(rows.filter((r) => !r.used_at).length, 1, 'exactly one active token remains');
  });

  await t.test('resend: unknown email returns the same generic response as a known one (no enumeration)', async () => {
    const unknown = await api('POST', '/auth/resend-verification', { body: { email: `${TAG}.nobody@example.com` } });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.json.data.sent, true);
  });

  await t.test('resend: already-verified email gets the sanctioned "already verified" response', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [reg.json.data.user.id]);

    const res = await api('POST', '/auth/resend-verification', { body: { email } });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.alreadyVerified, true);
  });

  await t.test('resend: unverified email issues a fresh token', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const before = await activeTokenRow(reg.json.data.user.id);

    const res = await api('POST', '/auth/resend-verification', { body: { email } });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.sent, true);

    const after = await activeTokenRow(reg.json.data.user.id);
    assert.notEqual(after.id, before.id, 'a new active token replaced the old one');
  });

  await t.test('resend is rate limited per email (429 after repeated requests)', async () => {
    const email = nextEmail();
    await registerRaw(email);

    const results = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await api('POST', '/auth/resend-verification', { body: { email } }));
    }
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.includes(429), `expected a 429 among ${JSON.stringify(statuses)}`);
  });

  await t.test('duplicate email on register returns 409, not 500', async () => {
    const email = nextEmail();
    await registerRaw(email);
    const dupe = await registerRaw(email);
    assert.equal(dupe.status, 409);
    assert.match(dupe.json.message, /already exists/i);
  });

  await t.test('duplicate student number on register returns 409, not 500', async () => {
    const studentNumber = `IT-DUP-${Date.now() % 100000}`;
    await registerRaw(nextEmail(), { student_number: studentNumber });
    const dupe = await registerRaw(nextEmail(), { student_number: studentNumber });
    assert.equal(dupe.status, 409);
    assert.match(dupe.json.message, /student number/i);
  });

  await t.test('concurrent duplicate registration: exactly one 201, the other a friendly 409 (never a 500)', async () => {
    const email = nextEmail();
    const [a, b] = await Promise.all([registerRaw(email), registerRaw(email)]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [201, 409]);
  });

  await t.test('existing (pre-verification-feature) users remain able to log in', async () => {
    // Simulate a pre-existing row the migration would have backfilled: created
    // directly (as migration 007-era code would have), verified via backfill.
    const email = nextEmail();
    const password = 'ItestPassw0rd!';
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 4);
    const roleRows = await db.query("SELECT id FROM roles WHERE name = 'student' LIMIT 1");
    const roleId = roleRows[0].id;
    const insert = await db.query(
      `INSERT INTO users (role_id, email, password_hash, first_name, last_name, is_active, email_verified_at)
       VALUES (?, ?, ?, 'Legacy', 'User', 1, CURRENT_TIMESTAMP)`,
      [roleId, email, passwordHash]
    );
    await db.query('INSERT INTO user_profiles (user_id, xp_points, level) VALUES (?, 0, 1)', [insert.insertId]);

    const res = await api('POST', '/auth/login', { body: { email, password } });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.token);
  });

  await t.test('the token hash never appears anywhere in an HTTP response body', async () => {
    const email = nextEmail();
    const reg = await registerRaw(email);
    const tokenRow = await activeTokenRow(reg.json.data.user.id);
    assert.doesNotMatch(JSON.stringify(reg.json), new RegExp(tokenRow.token_hash));
  });
});
