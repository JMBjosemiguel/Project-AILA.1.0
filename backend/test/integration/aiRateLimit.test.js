'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.rl.${Date.now()}`;

// Sends chat requests with an INVALID body: they still pass through the AI rate
// limiter (which runs before the validator) but the validator rejects them
// before any Gemini call — so we can exhaust the limiter without touching Gemini.
async function invalidChat(token) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '' }),
  });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, headers: res.headers, json };
}

test('AI rate limiter (real /api/chat route)', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable — start it with `npm run dev`');
    return;
  }

  const a = await createStudent(TAG, 'a');
  const b = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  await t.test('the AI limiter is wired to POST /api/chat and stops the 31st call', async () => {
    let sawValidation = 0;
    for (let i = 1; i <= 30; i++) {
      const r = await invalidChat(a.token);
      if (r.status === 422) sawValidation += 1;
      assert.notEqual(r.status, 429, `request #${i} should not be rate-limited yet (got ${r.status})`);
    }
    assert.ok(sawValidation >= 25, 'most sub-limit calls reach validation (422), proving no Gemini call');

    const blocked = await invalidChat(a.token);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.success, false);
    assert.match(blocked.json.message, /AI request limit/i);
    assert.ok(blocked.headers.get('retry-after'), 'Retry-After header present');
    assert.ok(blocked.headers.get('ratelimit'), 'RateLimit header present');
  });

  await t.test('a second student is unaffected by the first student hitting the limit', async () => {
    const r = await invalidChat(b.token); // student A is capped from the previous subtest
    assert.notEqual(r.status, 429, `student B must have an independent AI budget (got ${r.status})`);
  });

  await t.test('unauthenticated AI calls are rejected by auth, not counted per-shared-IP', async () => {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    assert.equal(res.status, 401);
  });

  await t.test('a non-AI endpoint is not affected by the AI limiter', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await api('GET', '/notifications', { token: a.token });
      assert.notEqual(r.status, 429);
    }
  });
});
