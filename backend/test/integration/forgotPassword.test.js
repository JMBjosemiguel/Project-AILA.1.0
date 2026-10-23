'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');
const { signPasswordResetToken } = require('../../src/utils/passwordResetToken');

const TAG = `qa.itest.forgotpw.${Date.now()}`;
const GENERIC_MESSAGE = 'If an account exists for that email, we sent a reset link.';

// There is no HTTP way to recover the raw token (EMAIL_DRIVER=console only
// logs it) — same reasoning as adminUsers.test.js's direct adminService
// calls for scenarios HTTP alone can't construct. Signs it the same way
// authService.forgotPassword does, straight from the user's current hash.
async function issueResetToken(userId) {
  const [row] = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
  return signPasswordResetToken(row);
}

test('forgot password / reset password', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('forgot-password always returns the same generic response — real account, unknown email, and inactive account', async () => {
    const student = await createStudent(TAG, 'generic');
    const real = await api('POST', '/auth/forgot-password', { body: { email: student.email } });
    const unknown = await api('POST', '/auth/forgot-password', { body: { email: `${TAG}.nobody@example.com` } });

    const inactiveStudent = await createStudent(TAG, 'inactive-generic');
    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [inactiveStudent.id]);
    const inactive = await api('POST', '/auth/forgot-password', { body: { email: inactiveStudent.email } });

    for (const res of [real, unknown, inactive]) {
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.message, GENERIC_MESSAGE);
      assert.deepEqual(res.json.data, null);
    }
  });

  await t.test('a freshly-issued token resets the password — old password stops working, new one works', async () => {
    const student = await createStudent(TAG, 'reset');
    const token = await issueResetToken(student.id);

    const reset = await api('POST', '/auth/reset-password', { body: { token, password: 'NewPassw0rd1!' } });
    assert.equal(reset.status, 200, JSON.stringify(reset.json));

    const oldLogin = await api('POST', '/auth/login', { body: { email: student.email, password: 'ItestPassw0rd!' } });
    assert.equal(oldLogin.status, 401);

    const newLogin = await api('POST', '/auth/login', { body: { email: student.email, password: 'NewPassw0rd1!' } });
    assert.equal(newLogin.status, 200);
  });

  await t.test('resetting the password ends every active session — the OLD token stops working on its very next request', async () => {
    const student = await createStudent(TAG, 'sessions');
    const before = await api('GET', '/auth/me', { token: student.token });
    assert.equal(before.status, 200, 'sanity check: the token really was valid before the reset');

    const token = await issueResetToken(student.id);
    await api('POST', '/auth/reset-password', { body: { token, password: 'NewPassw0rd1!' } });

    const after = await api('GET', '/auth/me', { token: student.token });
    assert.equal(after.status, 401, 'the same, still-unexpired login token must stop working after a reset');
  });

  await t.test('the SAME reset link cannot be used twice — the password-hash fingerprint no longer matches', async () => {
    const student = await createStudent(TAG, 'singleuse');
    const token = await issueResetToken(student.id);

    const first = await api('POST', '/auth/reset-password', { body: { token, password: 'FirstNewPass1!' } });
    assert.equal(first.status, 200);

    const second = await api('POST', '/auth/reset-password', { body: { token, password: 'SecondNewPass1!' } });
    assert.equal(second.status, 400);
    assert.match(second.json.message, /invalid|already been used/i);

    // The second attempt must not have silently changed the password either.
    const loginWithFirst = await api('POST', '/auth/login', { body: { email: student.email, password: 'FirstNewPass1!' } });
    assert.equal(loginWithFirst.status, 200);
  });

  await t.test('an expired token is rejected with a distinct, clear error', async () => {
    const student = await createStudent(TAG, 'expired');
    const [row] = await db.query('SELECT id, password_hash FROM users WHERE id = ?', [student.id]);
    const expiredToken = jwt.sign(
      { sub: row.id, purpose: 'password_reset', pwfp: require('node:crypto').createHash('sha256').update(row.password_hash).digest('hex') },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );

    const res = await api('POST', '/auth/reset-password', { body: { token: expiredToken, password: 'NewPassw0rd1!' } });
    assert.equal(res.status, 410);
    assert.match(res.json.message, /expired/i);
  });

  await t.test('a garbage/tampered token is rejected, never a 500', async () => {
    const res = await api('POST', '/auth/reset-password', { body: { token: 'not.a.real.token', password: 'NewPassw0rd1!' } });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /invalid/i);
  });

  await t.test('a password shorter than 8 characters is rejected, same rule as registration', async () => {
    const student = await createStudent(TAG, 'shortpw');
    const token = await issueResetToken(student.id);

    const res = await api('POST', '/auth/reset-password', { body: { token, password: 'short' } });
    assert.equal(res.status, 422);
  });

  await t.test('forgot-password is rate limited per email (429 after repeated requests)', async () => {
    const email = `${TAG}.ratelimit@example.com`;
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await api('POST', '/auth/forgot-password', { body: { email } }));
    }
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.includes(429), `expected a 429 among ${JSON.stringify(statuses)}`);
  });
});
