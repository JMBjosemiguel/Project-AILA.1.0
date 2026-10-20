'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

// Mirrors what multer's diskStorage now hands the service for every upload
// (R2 mode included, since uploadResourceFile.js always writes to disk —
// never multer.memoryStorage() — before storageService ever sees the file).
function makeTempFile(bytes = PNG) {
  const tempPath = path.join(os.tmpdir(), `storageService-test-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(tempPath, bytes);
  return { originalname: 't.png', mimetype: 'image/png', path: tempPath, size: bytes.length };
}

test('storageService R2 error classification', async (t) => {
  const realFetch = global.fetch;
  const realErr = console.error;
  let logs = [];
  t.beforeEach(() => { logs = []; console.error = (...a) => logs.push(a.join(' ')); });
  t.afterEach(() => { global.fetch = realFetch; console.error = realErr; });

  await t.test('403 SignatureDoesNotMatch -> 502 "rejected", and is logged with the R2 code', async () => {
    global.fetch = async () => s3ErrorResponse(403, 'SignatureDoesNotMatch', 'The request signature we calculated does not match');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 502 && /rejected the request/i.test(e.message));
    assert.ok(logs.some((line) => /\[ResourceStorage\] r2 PUT failed: status=403 code=SignatureDoesNotMatch/.test(line)));
    assert.ok(!logs.some((line) => /test-secret-key|test-access-key|Authorization|AWS4/.test(line)));
  });

  await t.test('403 AccessDenied -> 502 "rejected"', async () => {
    global.fetch = async () => s3ErrorResponse(403, 'AccessDenied', 'Access Denied');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 502 && /rejected the request/i.test(e.message));
  });

  await t.test('404 NoSuchBucket -> 404', async () => {
    global.fetch = async () => s3ErrorResponse(404, 'NoSuchBucket', 'The specified bucket does not exist');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 404);
  });

  await t.test('500 InternalError -> 502 "could not complete"', async () => {
    global.fetch = async () => s3ErrorResponse(500, 'InternalError', 'We encountered an internal error');
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 502 && /could not complete/i.test(e.message));
  });

  await t.test('network error -> 502 "unreachable", logged, no secret', async () => {
    global.fetch = async () => { throw new TypeError('fetch failed'); };
    const svc = loadService();
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 502 && /unreachable/i.test(e.message));
    assert.ok(logs.some((line) => /\[ResourceStorage\] r2 PUT network error/.test(line)));
  });

  await t.test('missing R2 config -> clear 503 configuration error', async () => {
    delete require.cache[require.resolve(SVC_PATH)];
    process.env.STORAGE_DRIVER = 'r2';
    delete process.env.R2_ACCESS_KEY_ID;
    const svc = require(SVC_PATH);
    await assert.rejects(() => svc.storeResourceFile(1, makeTempFile()), (e) => e.statusCode === 503 && /not configured/i.test(e.message));
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  });
});

test('storageService R2 upload streams the file instead of buffering it', async (t) => {
  const realFetch = global.fetch;
  t.afterEach(() => { global.fetch = realFetch; });

  await t.test('successful PUT returns an r2:// path, sends the body as a stream (never a Buffer), and never reads the error body', async () => {
    let receivedBody = null;
    let receivedHeaders = null;
    global.fetch = async (url, init) => {
      receivedBody = init.body;
      receivedHeaders = init.headers;
      return { ok: true, status: 200, text: async () => { throw new Error('must not read response body on success'); } };
    };
    const svc = loadService();
    const file = makeTempFile();
    const result = await svc.storeResourceFile(42, file);

    assert.match(result.filePath, /^r2:\/\/resources\/user-42\/\d+-[0-9a-f]{12}\.png$/);
    assert.equal(Buffer.isBuffer(receivedBody), false, 'the upload body must be a stream, not a fully-buffered Buffer');
    assert.equal(typeof receivedBody.getReader, 'function', 'expected a web ReadableStream');
    assert.equal(receivedHeaders['content-length'], String(PNG.length));
    assert.equal(receivedHeaders['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD', 'streamed uploads must not require hashing the whole body up front');
  });

  await t.test('the temp file is deleted after a successful upload', async () => {
    global.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
    const svc = loadService();
    const file = makeTempFile();
    await svc.storeResourceFile(1, file);
    assert.equal(fs.existsSync(file.path), false);
  });

  await t.test('the temp file is deleted even when the R2 upload fails', async () => {
    global.fetch = async () => s3ErrorResponse(500, 'InternalError', 'boom');
    const svc = loadService();
    const file = makeTempFile();
    const realErr = console.error;
    console.error = () => {};
    try {
      await assert.rejects(() => svc.storeResourceFile(1, file));
    } finally {
      console.error = realErr;
    }
    assert.equal(fs.existsSync(file.path), false);
  });

  // Not a real memory-pressure test (those are flaky across machines/CI), but
  // a deterministic proof of the same property: a 50 MB upload must not grow
  // the process's resident memory anywhere near 50 MB, which it would if the
  // file were read fully into a Buffer before being sent.
  await t.test('a large (50 MB) upload does not spike process memory', async () => {
    global.fetch = async (url, init) => {
      // Drain the stream the way a real HTTP client would, without buffering it.
      const reader = init.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
      return { ok: true, status: 200, text: async () => '' };
    };
    const svc = loadService();
    const bigFile = makeTempFile(Buffer.alloc(50 * 1024 * 1024, 0x41));

    if (global.gc) global.gc();
    const before = process.memoryUsage().heapUsed;
    await svc.storeResourceFile(1, bigFile);
    const after = process.memoryUsage().heapUsed;

    assert.ok(after - before < 20 * 1024 * 1024, `heap grew by ${Math.round((after - before) / 1024 / 1024)}MB for a 50MB upload — looks buffered`);
  });
});
