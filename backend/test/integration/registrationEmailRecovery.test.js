'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

const authService = require('../../src/services/authService');
const emailService = require('../../src/services/emailService');
const adminService = require('../../src/services/adminService');

const TAG = `qa.itest.regrecover.${Date.now()}`;
let n = 0;
function nextEmail() {
  n += 1;
  return `${TAG}.${n}@example.com`;
}

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

// authService.js holds the whole emailService module object (not a
// destructured function), so replacing this property is visible to
// authService immediately — no require-cache tricks needed.
const realSendVerificationEmail = emailService.sendVerificationEmail;
function stubEmailSuccess() {
  emailService.sendVerificationEmail = async () => ({ driver: 'console', to: 'stub' });
}
function stubEmailFailure(message = 'simulated SMTP failure: connection timed out') {
  emailService.sendVerificationEmail = async () => { throw new Error(message); };
}
function restoreEmail() {
  emailService.sendVerificationEmail = realSendVerificationEmail;
}

const BASE_PAYLOAD = { first_name: 'ITest', last_name: 'Recover', password: 'ItestPassw0rd!' };

async function activeTokenCount(userId) {
  const rows = await db.query('SELECT COUNT(*) c FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL', [userId]);
  return Number(rows[0].c);
}

test('registration email-delivery recovery', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  t.after(async () => {
    restoreEmail();
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('1. user + token creation succeeds, email succeeds -> full success response', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const result = await authService.register({ ...BASE_PAYLOAD, email });

    assert.equal(result.accountCreated, true);
    assert.equal(result.verificationRequired, true);
    assert.equal(result.emailSent, true);
    assert.equal(result.user.email, email);

    const row = (await db.query('SELECT email_verified_at FROM users WHERE id = ?', [result.user.id]))[0];
    assert.equal(row.email_verified_at, null, 'still unverified — only the email attempt succeeded, not verification itself');
    assert.equal(await activeTokenCount(result.user.id), 1);
  });

  await t.test('2. user + token creation succeeds, email FAILS -> account exists, response is truthfully recoverable, never "failed"', async () => {
    stubEmailFailure();
    const email = nextEmail();
    const result = await authService.register({ ...BASE_PAYLOAD, email });

    // The whole point of this fix: this must resolve, not throw. A caller
    // that only checks "did register() throw" would see success.
    assert.equal(result.accountCreated, true);
    assert.equal(result.verificationRequired, true);
    assert.equal(result.emailSent, false);
    assert.ok(!result.alreadyPending, 'a brand-new registration, not a retry of an existing pending one');

    const row = (await db.query('SELECT id, email_verified_at FROM users WHERE email = ?', [email]))[0];
    assert.ok(row, 'the user row exists in the database despite the email failure');
    assert.equal(row.email_verified_at, null);
    // A token was still issued (step 3, before the email attempt) — the
    // student can still be sent a working link via resend.
    assert.equal(await activeTokenCount(row.id), 1);
  });

  await t.test('3. email send failure does not create a duplicate account on a later, successful retry', async () => {
    stubEmailFailure();
    const email = nextEmail();
    const first = await authService.register({ ...BASE_PAYLOAD, email });
    assert.equal(first.emailSent, false);

    stubEmailSuccess();
    const second = await authService.register({ ...BASE_PAYLOAD, email, first_name: 'Different Name Typed The Second Time' });
    assert.equal(second.emailSent, true);
    assert.equal(second.alreadyPending, true, 'recognised as a retry of the existing unverified account, not a fresh signup');
    assert.equal(second.user.id, first.user.id, 'same account both times — no duplicate row');

    const rows = await db.query('SELECT id, first_name FROM users WHERE email = ?', [email]);
    assert.equal(rows.length, 1, 'exactly one user row for this email');
    // The retry's payload must NOT silently overwrite the existing account's
    // data (an attacker submitting a "retry" with someone else's known
    // pending email must not be able to rename/repossess the account).
    assert.equal(rows[0].first_name, 'ITest');
  });

  await t.test('4. retrying registration for an unverified account never duplicates the user and stays recoverable', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const first = await authService.register({ ...BASE_PAYLOAD, email });

    const second = await authService.register({ ...BASE_PAYLOAD, email });
    assert.equal(second.accountCreated, true);
    assert.equal(second.verificationRequired, true);
    assert.equal(second.alreadyPending, true);
    assert.equal(second.user.id, first.user.id);

    const rows = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    assert.equal(rows.length, 1);

    // Re-registering superseded the first token — only one active token, and
    // it is a DIFFERENT token than the first registration issued.
    const tokenRows = await db.query('SELECT id, used_at FROM email_verification_tokens WHERE user_id = ? ORDER BY id', [first.user.id]);
    assert.equal(tokenRows.length, 2);
    assert.ok(tokenRows[0].used_at, 'first token superseded');
    assert.equal(tokenRows[1].used_at, null, 'second token is the sole active one');
  });

  await t.test('5. a VERIFIED duplicate still gets the normal 409 conflict — unchanged behavior', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const created = await authService.register({ ...BASE_PAYLOAD, email });
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [created.user.id]);

    await assert.rejects(
      () => authService.register({ ...BASE_PAYLOAD, email }),
      (err) => err.statusCode === 409 && /already exists/i.test(err.message)
    );

    const rows = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    assert.equal(rows.length, 1, 'no duplicate row created by the rejected attempt');
  });

  await t.test('6. resend succeeds for an unverified account and issues a fresh token', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const created = await authService.register({ ...BASE_PAYLOAD, email });
    const before = await activeTokenCount(created.user.id);

    const result = await authService.resendVerification(email);
    assert.deepEqual(result, { sent: true });

    const tokenRows = await db.query('SELECT id, used_at FROM email_verification_tokens WHERE user_id = ? ORDER BY id', [created.user.id]);
    assert.equal(tokenRows.filter((r) => !r.used_at).length, before, 'still exactly one active token — old one superseded, new one issued');
  });

  await t.test('6b. resend is best-effort and never throws when the email send fails (no more raw 502)', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    await authService.register({ ...BASE_PAYLOAD, email });

    stubEmailFailure();
    const result = await authService.resendVerification(email);
    assert.deepEqual(result, { sent: true }, 'response shape is unaffected by the underlying send outcome');
  });

  await t.test('6c. resend never exposes whether the real send succeeded or failed (anti-enumeration)', async () => {
    // An unknown email and a known-unverified email whose real send FAILS
    // must be indistinguishable in the response — otherwise an SMTP outage
    // turns this endpoint into an account-existence oracle.
    stubEmailFailure();
    const knownEmail = nextEmail();
    stubEmailSuccess();
    await authService.register({ ...BASE_PAYLOAD, email: knownEmail });

    stubEmailFailure();
    const knownResult = await authService.resendVerification(knownEmail);
    const unknownResult = await authService.resendVerification(`${TAG}.nobody@example.com`);

    assert.deepEqual(knownResult, unknownResult);
    assert.deepEqual(knownResult, { sent: true });
  });

  await t.test('7. resend cannot create a duplicate user for an unknown email', async () => {
    const before = await db.query("SELECT COUNT(*) c FROM users WHERE email LIKE ?", [`${TAG}%`]);
    await authService.resendVerification(`${TAG}.never-registered@example.com`);
    const after = await db.query("SELECT COUNT(*) c FROM users WHERE email LIKE ?", [`${TAG}%`]);
    assert.equal(Number(after[0].c), Number(before[0].c));
  });

  await t.test('8. login remains blocked while email_verified_at is NULL', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    await authService.register({ ...BASE_PAYLOAD, email });

    await assert.rejects(
      () => authService.login({ email, password: BASE_PAYLOAD.password }, { deviceInfo: null, ipAddress: null }),
      (err) => err.statusCode === 403 && err.details?.code === 'EMAIL_NOT_VERIFIED'
    );
  });

  await t.test('9. login works after verification', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const created = await authService.register({ ...BASE_PAYLOAD, email });
    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [created.user.id]);

    const session = await authService.login({ email, password: BASE_PAYLOAD.password }, { deviceInfo: null, ipAddress: null });
    assert.ok(session.token);
    assert.equal(session.user.email, email);
  });

  await t.test('10. admin users listing exposes a verification state without leaking the token hash', async () => {
    stubEmailSuccess();
    const email = nextEmail();
    const created = await authService.register({ ...BASE_PAYLOAD, email });

    const { users } = await adminService.listUsers(1, { search: email, role: 'all', status: 'all', verification: 'all', sort: 'newest' });
    const row = users.find((u) => u.id === created.user.id);
    assert.ok(row, 'the new unverified user appears in the admin listing');
    assert.equal(row.email_verified_at, null, 'exposed as unverified');
    assert.ok(!('token_hash' in row) && !('password_hash' in row), 'no token/password hash leaked into the admin listing');

    await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [created.user.id]);
    const { users: usersAfter } = await adminService.listUsers(1, { search: email, role: 'all', status: 'all', verification: 'all', sort: 'newest' });
    assert.ok(usersAfter.find((u) => u.id === created.user.id).email_verified_at, 'flips to verified once the account is verified');

    // The new verification filter actually filters.
    const { users: pendingOnly } = await adminService.listUsers(1, { search: email, role: 'all', status: 'all', verification: 'pending', sort: 'newest' });
    assert.equal(pendingOnly.find((u) => u.id === created.user.id), undefined, 'now-verified user is excluded from the "pending" filter');
  });

  await t.test('11. a simulated SMTP failure error never contains SMTP credentials, and the token hash is never in the register() response', async () => {
    const secretLikeValue = 'sUpEr-Secret-Pass_12345';
    stubEmailFailure(`connect ECONNREFUSED — auth failed for user with password ${secretLikeValue}`);
    const email = nextEmail();
    const result = await authService.register({ ...BASE_PAYLOAD, email });

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /token_hash/i);
    assert.doesNotMatch(serialized, new RegExp(secretLikeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, /password_hash/i);
  });

  await t.test('12. the verification link built during registration uses APP_URL, never localhost, when APP_URL is set', async () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://aila-chat.pages.dev';
    let capturedUrl = null;
    emailService.sendVerificationEmail = async (user, verifyUrl) => { capturedUrl = verifyUrl; return { driver: 'console' }; };

    try {
      const email = nextEmail();
      await authService.register({ ...BASE_PAYLOAD, email });
      assert.match(capturedUrl, /^https:\/\/aila-chat\.pages\.dev\/verify-email\?token=/);
      assert.doesNotMatch(capturedUrl, /localhost/);
    } finally {
      process.env.APP_URL = originalAppUrl;
    }
  });
});
