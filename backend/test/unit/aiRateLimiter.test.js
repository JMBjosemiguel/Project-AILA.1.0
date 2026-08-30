'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const MW_PATH = path.join(__dirname, '../../src/middlewares/aiRateLimiter.js');

// Fresh limiter (and fresh in-memory store) per test.
function freshLimiter() {
  delete require.cache[require.resolve(MW_PATH)];
  return require(MW_PATH);
}

// Tiny app: fake "authenticate" that trusts an x-test-user header, then the limiter.
function makeApp(aiRateLimiter) {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const id = req.headers['x-test-user'];
    if (id) req.auth = { user: { id: Number(id) } };
    next();
  });
  app.post('/ai', aiRateLimiter, (req, res) => res.json({ ok: true }));
  app.get('/plain', (req, res) => res.json({ ok: true })); // no limiter
  return app;
}

function request(server, { userId, xff, url = '/ai', method = 'POST' } = {}) {
  const { port } = server.address();
  return new Promise((resolve) => {
    const headers = {};
    if (userId != null) headers['x-test-user'] = String(userId);
    if (xff) headers['x-forwarded-for'] = xff;
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* */ }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.end();
  });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  try { return await fn(server); } finally { server.close(); }
}

test('aiRateLimiter', async (t) => {
  await t.test('keyGenerator uses the authenticated user id, not the IP', () => {
    const { aiRateLimitKey } = freshLimiter();
    assert.equal(aiRateLimitKey({ auth: { user: { id: 7 } }, ip: '1.2.3.4' }), 'ai:user:7');
    assert.equal(aiRateLimitKey({ auth: { user: { id: 7 } }, ip: '9.9.9.9' }), 'ai:user:7'); // ip change, same key
  });

  await t.test('unauthenticated requests fall back to an IP-derived key', () => {
    const { aiRateLimitKey } = freshLimiter();
    assert.equal(aiRateLimitKey({ ip: '203.0.113.9' }), 'ai:ip:203.0.113.9');
    assert.match(aiRateLimitKey({ ip: '2001:db8::1' }), /^ai:ip:2001:db8::\/56$/); // ipv6 grouped
  });

  await t.test('allows 30 AI requests then returns a friendly 429 with headers', async () => {
    const { aiRateLimiter } = freshLimiter();
    await withServer(makeApp(aiRateLimiter), async (server) => {
      for (let i = 1; i <= 30; i++) {
        const r = await request(server, { userId: 1 });
        assert.equal(r.status, 200, `request #${i} should pass`);
      }
      const blocked = await request(server, { userId: 1 });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.success, false);
      assert.equal(blocked.json.details, null);
      assert.match(blocked.json.message, /AI request limit/i);
      assert.match(blocked.json.message, /try again in about \d+ minute/i);
      assert.ok(blocked.headers['retry-after'], 'Retry-After header present');
      assert.ok(blocked.headers['ratelimit'], 'RateLimit header present');
      assert.doesNotMatch(JSON.stringify(blocked.json), /gemini|api[_-]?key/i);
    });
  });

  await t.test('one user hitting the limit does NOT block a different authenticated user on the same IP', async () => {
    const { aiRateLimiter } = freshLimiter();
    await withServer(makeApp(aiRateLimiter), async (server) => {
      for (let i = 0; i < 31; i++) await request(server, { userId: 42 }); // user 42 is now capped
      const capped = await request(server, { userId: 42 });
      assert.equal(capped.status, 429);

      const other = await request(server, { userId: 43 }); // same IP, different user
      assert.equal(other.status, 200, 'user 43 must have an independent bucket');
    });
  });

  await t.test('a client cannot get a fresh bucket by spoofing X-Forwarded-For (key is the user id)', async () => {
    const { aiRateLimiter } = freshLimiter();
    await withServer(makeApp(aiRateLimiter), async (server) => {
      for (let i = 0; i < 30; i++) await request(server, { userId: 5, xff: `10.0.0.${i}` });
      const spoofed = await request(server, { userId: 5, xff: '203.0.113.255' });
      assert.equal(spoofed.status, 429, 'spoofing XFF must not reset an authenticated user bucket');
    });
  });

  await t.test('routes without the limiter are unaffected', async () => {
    const { aiRateLimiter } = freshLimiter();
    await withServer(makeApp(aiRateLimiter), async (server) => {
      for (let i = 0; i < 50; i++) {
        const r = await request(server, { userId: 1, url: '/plain', method: 'GET' });
        assert.equal(r.status, 200);
      }
    });
  });
});
