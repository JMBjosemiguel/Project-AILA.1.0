'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  generateVerificationToken,
  hashVerificationToken,
  looksLikeVerificationToken,
} = require('../../src/utils/verificationToken');

test('verificationToken', async (t) => {
  await t.test('generates a raw token and its sha256 hex hash, distinct from each other', () => {
    const { raw, hash } = generateVerificationToken();
    assert.match(raw, /^[A-Za-z0-9_-]+$/, 'base64url alphabet only');
    assert.equal(hash, crypto.createHash('sha256').update(raw).digest('hex'));
    assert.equal(hash.length, 64);
    assert.notEqual(raw, hash);
  });

  await t.test('raw tokens are unique per call and carry real entropy (not Math.random)', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      seen.add(generateVerificationToken().raw);
    }
    assert.equal(seen.size, 200, 'no collisions across 200 generations');

    // crypto.randomBytes(32) -> base64url is 43 chars (no padding); this is a
    // proxy for "genuinely 256 bits of entropy", not just "looks random".
    const { raw } = generateVerificationToken();
    assert.equal(raw.length, 43);
  });

  await t.test('hashVerificationToken is deterministic', () => {
    const raw = 'fixed-example-token-value-for-hash-check';
    assert.equal(hashVerificationToken(raw), hashVerificationToken(raw));
    assert.equal(hashVerificationToken(raw), crypto.createHash('sha256').update(raw).digest('hex'));
  });

  await t.test('looksLikeVerificationToken accepts real tokens and rejects garbage', () => {
    assert.equal(looksLikeVerificationToken(generateVerificationToken().raw), true);
    for (const bad of [null, undefined, 123, '', 'short', 'has spaces here', 'x'.repeat(65), 'has/slash+plus=pad']) {
      assert.equal(looksLikeVerificationToken(bad), false, JSON.stringify(bad));
    }
  });
});
