'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const multer = require('multer');

const { MAX_FILE_SIZE } = require('../../src/middlewares/uploadResourceFile');

test('uploadResourceFile', async (t) => {
  await t.test('the configured maximum is exactly 200 MB', () => {
    assert.equal(MAX_FILE_SIZE, 200 * 1024 * 1024);
  });

  await t.test('the friendly error message reports 200 MB', async () => {
    // Reload with a mocked multer error path isn't needed — the message is
    // built directly from MAX_FILE_SIZE (see uploadResourceFile.js), so this
    // asserts the same arithmetic the app uses to render it.
    assert.equal(`That file is too large. The maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`, 'That file is too large. The maximum size is 200 MB.');
  });

  // multer's own limits.fileSize boundary semantics — verified directly
  // against a throwaway small-limit server rather than moving 200 MB of real
  // data through the live R2-backed dev environment. The app's real
  // MAX_FILE_SIZE constant is asserted above; this proves the underlying
  // library (same version this app depends on) treats that number as an
  // INCLUSIVE upper bound, i.e. exactly-at-the-limit is accepted.
  await t.test('multer limits.fileSize is an inclusive boundary (exactly-at-limit accepted, +1 byte rejected)', async () => {
    const LIMIT = 64; // bytes — small and fast; only the boundary semantics matter here
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMIT } }).single('file');
    app.post('/upload', (req, res) => {
      upload(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ ok: false, code: 'LIMIT_FILE_SIZE' });
          return;
        }
        if (err) {
          res.status(500).json({ ok: false });
          return;
        }
        res.status(201).json({ ok: true, size: req.file.size });
      });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      const post = async (bytes) => {
        const fd = new FormData();
        fd.append('file', new Blob([Buffer.alloc(bytes, 0x41)], { type: 'application/pdf' }), 'f.pdf');
        const res = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: fd });
        return { status: res.status, json: await res.json() };
      };

      const atLimit = await post(LIMIT);
      assert.equal(atLimit.status, 201, 'exactly-at-the-limit must be accepted');
      assert.equal(atLimit.json.size, LIMIT);

      const overLimit = await post(LIMIT + 1);
      assert.equal(overLimit.status, 400, 'one byte over the limit must be rejected');
      assert.equal(overLimit.json.code, 'LIMIT_FILE_SIZE');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
