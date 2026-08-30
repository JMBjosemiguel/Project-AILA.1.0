'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CLIENT_PATH = path.join(__dirname, '../../src/services/geminiClient.js');

function loadClient({ model, timeoutMs } = {}) {
  delete require.cache[require.resolve(CLIENT_PATH)];
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  if (model === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = model;
  process.env.GEMINI_TIMEOUT_MS = String(timeoutMs ?? 5000);
  return require(CLIENT_PATH);
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const CHAT_ARGS = {
  contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
  generationConfig: { temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
};

test('geminiClient', async (t) => {
  const realFetch = global.fetch;
  t.afterEach(() => { global.fetch = realFetch; });

  await t.test('default model is a pinned version, not a -latest alias', () => {
    let calledUrl = '';
    global.fetch = async (url) => { calledUrl = String(url); return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }); };
    const client = loadClient({ model: undefined });
    return client.callGemini(CHAT_ARGS).then(() => {
      assert.match(calledUrl, /\/models\/gemini-3\.5-flash:generateContent/);
      assert.doesNotMatch(calledUrl, /-latest/);
    });
  });

  await t.test('retries once on a 503 then succeeds', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } });
      return jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'recovered' }] } }] });
    };
    const client = loadClient();
    const payload = await client.callGemini(CHAT_ARGS);
    assert.equal(calls, 2);
    assert.equal(client.getResponseText(payload), 'recovered');
  });

  await t.test('a sustained 503 maps to the friendly "temporarily unavailable" ApiError', async () => {
    global.fetch = async () => jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } });
    const client = loadClient();
    await assert.rejects(() => client.callGemini(CHAT_ARGS), (err) => {
      assert.equal(err.statusCode, 503);
      assert.match(err.message, /temporarily unavailable/i);
      return true;
    });
  });

  await t.test('401 maps to an auth-config ApiError and is not retried', async () => {
    let calls = 0;
    global.fetch = async () => { calls += 1; return jsonResponse(401, { error: { code: 401, message: 'API key invalid' } }); };
    const client = loadClient();
    await assert.rejects(() => client.callGemini(CHAT_ARGS), (err) => err.statusCode === 503 && /authenticate with Gemini/i.test(err.message));
    assert.equal(calls, 1, '401 must not be retried');
  });

  await t.test('missing GEMINI_API_KEY throws a clear configuration error', async () => {
    delete require.cache[require.resolve(CLIENT_PATH)];
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const client = require(CLIENT_PATH);
    await assert.rejects(() => client.callGemini(CHAT_ARGS), (err) => err.statusCode === 503 && /Gemini API key/i.test(err.message));
    process.env.GEMINI_API_KEY = saved;
  });
});
