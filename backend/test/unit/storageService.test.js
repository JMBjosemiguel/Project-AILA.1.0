'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SVC_PATH = path.join(__dirname, '../../src/services/storageService.js');

function loadService() {
  delete require.cache[require.resolve(SVC_PATH)];
  process.env.STORAGE_DRIVER = 'r2';
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_BUCKET = 'aila-resources';
  delete process.env.R2_ENDPOINT;
  return require(SVC_PATH);
}

function s3ErrorResponse(status, code, message) {
  return {
    ok: false,
    status,
    text: async () => `<?xml version="1.0"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`,
  };
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const FAKE_FILE = { originalname: 't.png', mimetype: 'image/png', buffer: PNG, size: PNG.length };

test('storageService R2 error classification', async (t) => {
  const realFetch = global.fetch;
  const realErr = console.error;
  const logs = [];
  t.beforeEach(() => { console.error = (...a) => logs.splice(0, logs.length, a.join(' ')); });
  t.afterEach(() => { global.fetch = realFetch; console.error = realErr; });

  await t.test('403 SignatureDoesNotMatch -> 502 "rejected", and is logged with the R2 code', async () => {
    global.fetch = async () => s3ErrorResponse(403, 'SignatureDoesNotMatch', 'The request signature we calculated does not match');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 502 && /rejected the request/i.test(e.message));
    assert.match(logs[0], /\[ResourceStorage\] r2 PUT failed: status=403 code=SignatureDoesNotMatch/);
    assert.doesNotMatch(logs[0], /test-secret-key|test-access-key|Authorization|AWS4/);
  });

  await t.test('403 AccessDenied -> 502 "rejected"', async () => {
    global.fetch = async () => s3ErrorResponse(403, 'AccessDenied', 'Access Denied');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 502 && /rejected the request/i.test(e.message));
  });

  await t.test('404 NoSuchBucket -> 404', async () => {
    global.fetch = async () => s3ErrorResponse(404, 'NoSuchBucket', 'The specified bucket does not exist');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 404);
  });

  await t.test('500 InternalError -> 502 "could not complete"', async () => {
    global.fetch = async () => s3ErrorResponse(500, 'InternalError', 'We encountered an internal error');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 502 && /could not complete/i.test(e.message));
  });

  await t.test('network error -> 502 "unreachable", logged, no secret', async () => {
    global.fetch = async () => { throw new TypeError('fetch failed'); };
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 502 && /unreachable/i.test(e.message));
    assert.match(logs[0], /\[ResourceStorage\] r2 PUT network error/);
  });

  await t.test('successful PUT returns an r2:// path and does not read the body', async () => {
    let bodyRead = false;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => { bodyRead = true; return ''; } });
    const svc = loadService();
    const result = await svc.storeResourceFile(42, FAKE_FILE);
    assert.match(result.filePath, /^r2:\/\/resources\/user-42\/\d+-[0-9a-f]{12}\.png$/);
    assert.equal(bodyRead, false);
  });

  await t.test('missing R2 config -> clear 503 configuration error', async () => {
    delete require.cache[require.resolve(SVC_PATH)];
    process.env.STORAGE_DRIVER = 'r2';
    delete process.env.R2_ACCESS_KEY_ID;
    const svc = require(SVC_PATH);
    await assert.rejects(() => svc.storeResourceFile(1, FAKE_FILE), (e) => e.statusCode === 503 && /not configured/i.test(e.message));
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  });
});
