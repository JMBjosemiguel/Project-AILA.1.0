'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../../src/server');
const db = require('../../src/config/database');

function getHealth(server) {
  const { port } = server.address();
  const startedAt = Date.now();
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/health' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        resolve({ status: res.statusCode, json: JSON.parse(body), elapsedMs: Date.now() - startedAt });
      });
    });
  });
}

test('/health', async (t) => {
  const realGetConnection = db.pool.getConnection;
  t.afterEach(() => { db.pool.getConnection = realGetConnection; });

  await t.test('reports database: "ok" and responds quickly when the DB ping succeeds', async (t2) => {
    db.pool.getConnection = async () => ({ ping: async () => {}, release: () => {} });
    const server = app.listen(0);
    t2.after(() => server.close());

    const { status, json, elapsedMs } = await getHealth(server);
    assert.equal(status, 200);
    assert.equal(json.status, 'ok');
    assert.equal(json.database, 'ok');
    assert.ok(elapsedMs < 1000, `expected a fast response, took ${elapsedMs}ms`);
  });

  await t.test('still returns 200 (process is healthy) but reports database: "error" when the DB ping fails', async (t2) => {
    db.pool.getConnection = async () => { throw new Error('connect ECONNREFUSED'); };
    const server = app.listen(0);
    t2.after(() => server.close());

    const { status, json } = await getHealth(server);
    assert.equal(status, 200, 'a DB blip must not make Render think the whole service is unhealthy');
    assert.equal(json.database, 'error');
  });

  await t.test('does not hang if the DB ping never resolves — the 2s guard caps the response time', async (t2) => {
    db.pool.getConnection = () => new Promise(() => {}); // never resolves
    const server = app.listen(0);
    t2.after(() => server.close());

    const { status, json, elapsedMs } = await getHealth(server);
    assert.equal(status, 200);
    assert.equal(json.database, 'error');
    assert.ok(elapsedMs < 3000, `expected the 2s internal timeout to cap this, took ${elapsedMs}ms`);
  });
});
