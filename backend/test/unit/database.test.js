'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/config/database');
const { formatStartupError } = require('../../src/utils/formatStartupError');

function errorWithCode(code, message = 'simulated') {
  const error = new Error(message);
  error.code = code;
  return error;
}

test('database.query', async (t) => {
  const realQuery = db.pool.query;
  t.afterEach(() => { db.pool.query = realQuery; });

  await t.test('retries once on a dead-connection error and succeeds on the fresh connection', async () => {
    let calls = 0;
    db.pool.query = async () => {
      calls += 1;
      if (calls === 1) throw errorWithCode('PROTOCOL_CONNECTION_LOST');
      return [[{ ok: 1 }]];
    };

    const rows = await db.query('SELECT 1');
    assert.deepEqual(rows, [{ ok: 1 }]);
    assert.equal(calls, 2, 'should have retried exactly once');
  });

  await t.test('does not retry a second time — a second dead-connection error still rejects', async () => {
    let calls = 0;
    db.pool.query = async () => {
      calls += 1;
      throw errorWithCode('ECONNRESET');
    };

    await assert.rejects(() => db.query('SELECT 1'), (e) => e.code === 'ECONNRESET');
    assert.equal(calls, 2, 'one original attempt + exactly one retry, no more');
  });

  await t.test('a non-dead-connection error (e.g. a real SQL error) is never retried', async () => {
    let calls = 0;
    db.pool.query = async () => {
      calls += 1;
      throw errorWithCode('ER_BAD_FIELD_ERROR', "Unknown column 'x'");
    };

    await assert.rejects(() => db.query('SELECT x'), (e) => e.code === 'ER_BAD_FIELD_ERROR');
    assert.equal(calls, 1, 'a genuine query error must not trigger a retry');
  });

  await t.test('isDeadConnectionError recognizes the documented transient codes', () => {
    for (const code of ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ER_CON_COUNT_ERROR']) {
      assert.equal(db.isDeadConnectionError(errorWithCode(code)), true, code);
    }
    assert.equal(db.isDeadConnectionError(errorWithCode('ER_LOCK_DEADLOCK')), false);
    assert.equal(db.isDeadConnectionError(null), false);
  });
});

test('database.transaction', async (t) => {
  const realGetConnection = db.pool.getConnection;
  t.afterEach(() => { db.pool.getConnection = realGetConnection; });

  function fakeConnection(queryImpl) {
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: queryImpl,
    };
  }

  await t.test('a dead-connection error is NOT retried inside a transaction (only deadlock/lock-wait codes are)', async () => {
    let attempts = 0;
    db.pool.getConnection = async () => fakeConnection(async () => {
      attempts += 1;
      throw errorWithCode('PROTOCOL_CONNECTION_LOST');
    });

    await assert.rejects(
      () => db.transaction(async (conn) => conn.query('INSERT INTO x VALUES (1)')),
      (e) => e.code === 'PROTOCOL_CONNECTION_LOST'
    );
    assert.equal(attempts, 1, 'transaction() must not retry a dead-connection error — only its own deadlock retry applies');
  });

  await t.test('its existing deadlock retry still works unchanged', async () => {
    let attempts = 0;
    db.pool.getConnection = async () => fakeConnection(async () => {
      attempts += 1;
      if (attempts < 3) throw errorWithCode('ER_LOCK_DEADLOCK');
      return [{ affectedRows: 1 }];
    });

    const result = await db.transaction(async (conn) => conn.query('UPDATE x SET y = 1'));
    assert.deepEqual(result, [{ affectedRows: 1 }]);
    assert.equal(attempts, 3);
  });
});

test('formatStartupError', async (t) => {
  await t.test('plain error: includes code, message and target host/port', () => {
    const error = errorWithCode('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:3306');
    const formatted = formatStartupError(error, { host: '127.0.0.1', port: 3306 });
    assert.match(formatted, /ECONNREFUSED/);
    assert.match(formatted, /127\.0\.0\.1:3306/);
  });

  await t.test('an AggregateError with an empty top-level message still surfaces the real code/message', () => {
    const inner = errorWithCode('ECONNREFUSED', 'connect ECONNREFUSED ::1:3306');
    const aggregate = new AggregateError([inner], '');
    const formatted = formatStartupError(aggregate, { host: 'localhost', port: 3306 });
    assert.match(formatted, /ECONNREFUSED/);
    assert.match(formatted, /connect ECONNREFUSED ::1:3306/);
  });
});
