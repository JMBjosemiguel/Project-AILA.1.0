'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '../../src/scripts/validateDeploymentConfig.js');

// A production-shaped, all-placeholder env that passes on its own.
const BASE_ENV = {
  NODE_ENV: 'production',
  APP_URL: 'https://aila-chat.pages.dev',
  DB_HOST: 'db.example.aivencloud.com',
  DB_PORT: '12345',
  DB_USER: 'avnadmin',
  DB_PASSWORD: 'placeholder',
  DB_NAME: 'project-aila',
  DB_SSL: 'true',
  JWT_SECRET: '0123456789abcdef0123456789abcdef0123',
  GEMINI_API_KEY: 'placeholder',
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'placeholder',
  R2_SECRET_ACCESS_KEY: 'placeholder',
  R2_BUCKET: 'aila-resources',
};

function run(overrides = {}) {
  const env = { ...BASE_ENV, ...overrides };
  for (const [k, v] of Object.entries(overrides)) if (v === null) delete env[k];
  try {
    // run from a dir with no .env so dotenv can't backfill the vars we omit
    const out = execFileSync(process.execPath, [SCRIPT], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

test('validateDeploymentConfig', async (t) => {
  await t.test('passes with a valid production-shaped env (no R2_ENDPOINT)', () => {
    const r = run();
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /validation passed/);
  });

  await t.test('passes with a valid bare https R2_ENDPOINT', () => {
    const r = run({ R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com` });
    assert.equal(r.code, 0, r.out);
  });

  await t.test('rejects an R2_ENDPOINT that includes a bucket path', () => {
    const r = run({ R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/aila-resources` });
    assert.equal(r.code, 1);
    assert.match(r.out, /R2_ENDPOINT must be a bare https/);
  });

  await t.test('rejects a non-https R2_ENDPOINT', () => {
    const r = run({ R2_ENDPOINT: `http://${'a'.repeat(32)}.r2.cloudflarestorage.com` });
    assert.equal(r.code, 1);
    assert.match(r.out, /R2_ENDPOINT/);
  });

  await t.test('rejects a malformed R2_ENDPOINT', () => {
    const r = run({ R2_ENDPOINT: 'not a url' });
    assert.equal(r.code, 1);
    assert.match(r.out, /R2_ENDPOINT must be a valid/);
  });

  await t.test('still requires the core R2 vars when STORAGE_DRIVER=r2', () => {
    const r = run({ R2_SECRET_ACCESS_KEY: null });
    assert.equal(r.code, 1);
    assert.match(r.out, /R2_SECRET_ACCESS_KEY is required/);
  });
});
