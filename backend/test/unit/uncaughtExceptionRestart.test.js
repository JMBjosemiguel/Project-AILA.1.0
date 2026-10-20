'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const FIXTURE_PATH = path.join(__dirname, 'fixtures/crashOnUncaughtException.js');

function runFixture() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [FIXTURE_PATH], {
      cwd: path.join(__dirname, '../..'),
      env: process.env,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('exit', (code) => {
      resolve({ code, stderr, elapsedMs: Date.now() - startedAt });
    });
  });
}

test('uncaughtException restarts the process cleanly', async (t) => {
  // Spawns a real child process (rather than firing process.emit directly in
  // this test's own process) because the whole point under test is
  // process.exit(1) actually happening — doing that in-process would kill
  // the test runner itself.
  const { code, stderr, elapsedMs } = await runFixture();

  await t.test('logs the error (code/message), no secrets', () => {
    assert.match(stderr, /\[process\] uncaughtException:/);
    assert.match(stderr, /deliberate test crash for uncaughtExceptionRestart\.test\.js/);
    assert.doesNotMatch(stderr, /JWT_SECRET|DB_PASSWORD|GEMINI_API_KEY|R2_SECRET_ACCESS_KEY/);
  });

  await t.test('exits with code 1', () => {
    assert.equal(code, 1);
  });

  await t.test('exits only after a short delay, not instantly (time for the log to flush)', () => {
    assert.ok(elapsedMs >= 900, `expected at least ~1000ms before exit, took ${elapsedMs}ms`);
  });
});
