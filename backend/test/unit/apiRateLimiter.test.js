'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const MW_PATH = path.join(__dirname, '../../src/middlewares/apiRateLimiter.js');

function freshLimiter() {
  delete require.cache[require.resolve(MW_PATH)];
  return require(MW_PATH);
}

function makeApp(apiRateLimiter) {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api', apiRateLimiter);
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  return app;
}

function request(server) {
  const { port } = server.address();
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/api/ping' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* */ }
        resolve({ status: res.statusCode, json });
      });
    });
  });
}

test('apiRateLimiter', async (t) => {
  await t.test('the configured general limit is exactly 1000 per 15 minutes', () => {
    const { GENERAL_API_LIMIT, GENERAL_API_WINDOW_MS } = freshLimiter();
    assert.equal(GENERAL_API_LIMIT, 1000);
    assert.equal(GENERAL_API_WINDOW_MS, 15 * 60 * 1000);
  });

  await t.test('allows exactly 1000 requests from one IP, then returns a friendly 429', async (t2) => {
    const { apiRateLimiter } = freshLimiter();
    const server = makeApp(apiRateLimiter).listen(0);
    t2.after(() => server.close());

    for (let i = 1; i <= 1000; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(server);
      assert.equal(r.status, 200, `request #${i} should pass`);
    }

    const blocked = await request(server);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.success, false);
    assert.equal(blocked.json.details, null);
    assert.equal(blocked.json.message, 'Too many requests — please wait a moment and try again.');
  });
});
