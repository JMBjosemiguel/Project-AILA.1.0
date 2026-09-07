'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '../../src/config/database.js');
const GEMINI_PATH = path.join(__dirname, '../../src/services/geminiClient.js');
const SVC_PATH = path.join(__dirname, '../../src/services/courseGenerationService.js');
const NOTIFY_PATH = path.join(__dirname, '../../src/utils/notify.js');

// Load a fresh courseGenerationService wired to fake DB + Gemini.
function loadService({ storedContent = null, geminiImpl } = {}) {
  for (const p of [DB_PATH, GEMINI_PATH, SVC_PATH, NOTIFY_PATH]) delete require.cache[require.resolve(p)];

  const db = require(DB_PATH);
  const queryCalls = [];
  db.query = async (sql, params) => {
    queryCalls.push({ sql, params });
    if (/SELECT content FROM lessons/i.test(sql)) {
      return [{ content: storedContent }];
    }
    if (/UPDATE lessons SET content/i.test(sql)) {
      return { affectedRows: storedContent ? 0 : 1 };
    }
    return [];
  };

  const gemini = require(GEMINI_PATH);
  let geminiCalls = 0;
  gemini.callGemini = async (...args) => {
    geminiCalls += 1;
    if (geminiImpl) return geminiImpl(...args);
    await new Promise((r) => setTimeout(r, 20));
    return { candidates: [{ content: { parts: [{ text: '## Summary\nGenerated body.' }] } }] };
  };

  require(NOTIFY_PATH).notifyUser = async () => {};

  const svc = require(SVC_PATH);
  return { svc, queryCalls, getGeminiCalls: () => geminiCalls };
}

const LESSON = { id: 501, title: 'Recursion', topic_title: 'Functions', module_title: 'Basics', subject_name: 'CS', goal: 'pass' };

test('generateLessonContent', async (t) => {
  await t.test('returns already-stored content without calling Gemini', async () => {
    const { svc, getGeminiCalls } = loadService({ storedContent: '## Already here' });
    const content = await svc.generateLessonContent(LESSON);
    assert.equal(content, '## Already here');
    assert.equal(getGeminiCalls(), 0);
  });

  await t.test('two concurrent opens of the same lesson trigger only one Gemini call', async () => {
    const { svc, getGeminiCalls } = loadService({ storedContent: null });
    const [a, b] = await Promise.all([
      svc.generateLessonContent(LESSON),
      svc.generateLessonContent(LESSON),
    ]);
    assert.equal(getGeminiCalls(), 1, 'the in-flight guard de-duplicates the generation');
    assert.equal(a, b);
    assert.match(a, /Generated body/);
  });

  await t.test('a Gemini failure rejects and never writes partial content', async () => {
    const { svc, queryCalls } = loadService({
      storedContent: null,
      geminiImpl: async () => { throw new Error('gemini down'); },
    });
    await assert.rejects(() => svc.generateLessonContent(LESSON), /gemini down/);
    assert.equal(queryCalls.filter((c) => /UPDATE lessons SET content/i.test(c.sql)).length, 0);
  });

  await t.test('after a failed generation the guard is cleared so a retry can succeed', async () => {
    let attempt = 0;
    const { svc } = loadService({
      storedContent: null,
      geminiImpl: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('transient');
        return { candidates: [{ content: { parts: [{ text: '## Summary\nGenerated body.' }] } }] };
      },
    });
    await assert.rejects(() => svc.generateLessonContent(LESSON), /transient/);
    const retry = await svc.generateLessonContent(LESSON);
    assert.match(retry, /Generated body/);
  });
});
