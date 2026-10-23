'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-not-real-0123456789';

const {
  signPasswordResetToken,
  verifyPasswordResetToken,
  matchesCurrentPasswordHash,
} = require('../../src/utils/passwordResetToken');

const USER = { id: 42, password_hash: '$2b$10$fakeHashValueForTestingOnly.....................' };

test('passwordResetToken', async (t) => {
  await t.test('signs a token carrying the user id, purpose, and a fingerprint (never the raw hash)', () => {
    const token = signPasswordResetToken(USER);
    const decoded = jwt.decode(token);
    assert.equal(decoded.sub, USER.id);
    assert.equal(decoded.purpose, 'password_reset');
    assert.ok(decoded.pwfp, 'carries a fingerprint');
    assert.notEqual(decoded.pwfp, USER.password_hash, 'never the raw password hash itself');
    assert.equal(decoded.pwfp.length, 64, 'sha256 hex digest');
  });

  await t.test('verifyPasswordResetToken round-trips a token this module signed', () => {
    const token = signPasswordResetToken(USER);
    const payload = verifyPasswordResetToken(token);
    assert.equal(payload.sub, USER.id);
    assert.equal(payload.purpose, 'password_reset');
  });

  await t.test('rejects a token with the wrong purpose (e.g. a login-shaped JWT signed with the same secret)', () => {
    const loginShapedToken = jwt.sign({ sub: USER.id, role: 'student', sessionId: 1 }, process.env.JWT_SECRET, { expiresIn: '1d' });
    assert.throws(() => verifyPasswordResetToken(loginShapedToken), /purpose|password reset token/i);
  });

  await t.test('rejects an expired token', () => {
    const expired = jwt.sign(
      { sub: USER.id, purpose: 'password_reset', pwfp: 'x' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    assert.throws(() => verifyPasswordResetToken(expired), (err) => err.name === 'TokenExpiredError');
  });

  await t.test('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ sub: USER.id, purpose: 'password_reset', pwfp: 'x' }, 'a-completely-different-secret', { expiresIn: '30m' });
    assert.throws(() => verifyPasswordResetToken(token));
  });

  await t.test('matchesCurrentPasswordHash: true for the same hash the token was issued for, false once it changes', () => {
    const token = signPasswordResetToken(USER);
    const payload = verifyPasswordResetToken(token);
    assert.equal(matchesCurrentPasswordHash(payload, USER.password_hash), true);
    assert.equal(matchesCurrentPasswordHash(payload, '$2b$10$aDifferentHashAfterThePasswordChanged.....'), false);
  });
});
