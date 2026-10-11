'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drives quizService's batched-generation functions directly, in-process,
// against the real local DB, with a stubbed Gemini — same approach as
// courseAssessments.test.js (conserves the real Gemini call budget, which is
// reserved for the batch's explicit live-verification task).
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};

let geminiCalls = 0;
let responder = null; // (promptText, requestedCount) => { question, options, correctAnswer, explanation }[]

function requestedCountFromPrompt(text) {
  const m = /^Generate (\d+)/.exec(text || '');
  return m ? Number(m[1]) : 0;
}

function isPlanPrompt(text) {
  return (text || '').includes('batches of questions, generated separately');
}

const gemini = require('../../src/services/geminiClient');
gemini.callGemini = async (args) => {
  geminiCalls += 1;
  const text = args?.contents?.[0]?.parts?.[0]?.text || '';
  if (isPlanPrompt(text)) {
    // Let the real fallback (raw topic repeated) handle planning — not under
    // test here, buildSubtopicPlan has its own dedicated unit test.
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ subtopics: [] }) }] } }] };
  }
  const count = requestedCountFromPrompt(text);
  const items = await responder(count, text);
  return { candidates: [{ content: { parts: [{ text: JSON.stringify({ topic: 'X', quizType: 'multiple_choice', items }) }] } }] };
};

for (const p of ['../../src/services/quizService']) {
  delete require.cache[require.resolve(p)];
}
const quizService = require('../../src/services/quizService');

const TAG = `qa.itest.batchquiz.${Date.now()}`;

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const r = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', 'IT', ?, 1)",
    [`B-${suffix}-${Date.now() % 100000}`, email, suffix]
  );
  await db.query('INSERT INTO user_profiles (user_id, xp_points, level) VALUES (?, 0, 1)', [r.insertId]);
  return { id: r.insertId, email };
}

// Fresh, always-unique MC items — safe to use across batches without ever
// tripping cross-batch dedupe by accident.
function uniqueItemsResponder(counterRef) {
  return async (count) => Array.from({ length: Math.max(0, count) }, () => {
    counterRef.n += 1;
    return { question: `Stub question #${counterRef.n}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'because a' };
  });
}

// Always returns roughly half of what was asked for (rounded up), unique
// each time — simulates persistent truncation/short generation.
function halfShortResponder(counterRef) {
  return async (count) => {
    const n = Math.ceil(Math.max(0, count) / 2);
    return Array.from({ length: n }, () => {
      counterRef.n += 1;
      return { question: `Short question #${counterRef.n}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'because a' };
    });
  };
}

// Every call includes one fixed, repeated stem plus (count-1) fresh items —
// exercises cross-batch dedupe + the single top-up call once that stem has
// already been saved by an earlier batch.
function dupStemResponder(counterRef) {
  return async (count) => {
    const items = [{ question: 'Duplicate stem?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'dup' }];
    for (let i = 1; i < Math.max(0, count); i += 1) {
      counterRef.n += 1;
      items.push({ question: `Fresh question #${counterRef.n}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'fresh' });
    }
    return items;
  };
}

async function quizRowCounts(quizId) {
  const [{ actual }] = await db.query('SELECT COUNT(*) AS actual FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  const [{ item_count: itemCount }] = await db.query('SELECT item_count FROM quizzes WHERE id = ?', [quizId]);
  return { actual: Number(actual), itemCount: Number(itemCount) };
}

test('batched quiz generation', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a');
  const B = await makeStudent('b');
  const createdUserIds = [A.id, B.id];

  t.after(async () => {
    for (const uid of createdUserIds) {
      await db.query('DELETE FROM quiz_attempt_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?)', [uid]).catch(() => {});
      await db.query('DELETE FROM quiz_attempts WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE user_id = ?)', [uid]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM xp_events WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_profiles WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('HAPPY PATH: start -> batches -> finish reaches the full target with contiguous ordering', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} happy`, quizType: 'multiple_choice', itemCount: 22, difficulty: 'medium',
    });
    assert.equal(started.target, 22);
    assert.equal(started.batchSize, quizService.BATCH_MAX_ITEMS);
    assert.equal(started.subtopics.length, 2, 'ceil(22/15) = 2 batches');

    const b1 = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, subtopic: started.subtopics[0] });
    assert.equal(b1.added, 15);
    assert.equal(b1.total, 15);

    const b2 = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, subtopic: started.subtopics[1] });
    assert.equal(b2.added, 7, 'remaining 22-15=7, capped to what is left, not the full batch size');
    assert.equal(b2.total, 22);

    const finished = await quizService.finishQuizGeneration({ userId: A.id, quizId: started.quizId });
    assert.equal(finished.target, 22);
    assert.equal(finished.actual, 22);

    const { actual, itemCount } = await quizRowCounts(started.quizId);
    assert.equal(actual, 22);
    assert.equal(itemCount, 22, 'item_count corrected to the real count');

    const rows = await db.query('SELECT order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [started.quizId]);
    assert.deepEqual(rows.map((r) => r.order_index), Array.from({ length: 22 }, (_, i) => i), 'order_index is contiguous 0..21 with no gaps or dupes');

    const attempt = await quizService.startAttempt(A.id, started.quizId);
    assert.equal(attempt.items.length, 22);
  });

  await t.test('PARTIAL RESULT: a persistently short generator still finishes usably below target', async () => {
    const counter = { n: 0 };
    responder = halfShortResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} partial`, quizType: 'multiple_choice', itemCount: 28, difficulty: 'medium',
    });
    assert.equal(started.target, 28);

    await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, subtopic: started.subtopics[0] });
    await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, subtopic: started.subtopics[1] });

    const { actual: actualBeforeFinish } = await quizRowCounts(started.quizId);
    assert.ok(actualBeforeFinish > 0 && actualBeforeFinish < 28, `expected a short-of-target save, got ${actualBeforeFinish}`);

    const finished = await quizService.finishQuizGeneration({ userId: A.id, quizId: started.quizId });
    assert.equal(finished.target, 28);
    assert.equal(finished.actual, actualBeforeFinish, 'finish reports the real saved count, not the target');

    const { itemCount } = await quizRowCounts(started.quizId);
    assert.equal(itemCount, actualBeforeFinish, 'item_count is corrected to match reality, never left at the unmet target');

    const attempt = await quizService.startAttempt(A.id, started.quizId);
    assert.equal(attempt.items.length, actualBeforeFinish, 'a partial quiz is fully usable with its real count');
  });

  await t.test('CROSS-BATCH DEDUPE: a repeated stem from an earlier batch is filtered, triggering exactly one top-up call', async () => {
    const counter = { n: 0 };
    responder = dupStemResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} dedupe`, quizType: 'multiple_choice', itemCount: 10, difficulty: 'medium',
    });

    const b1 = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 5 });
    assert.equal(b1.added, 5, 'nothing saved yet to dedupe against, so the stem is kept the first time');

    const before = geminiCalls;
    const b2 = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 5 });
    assert.equal(geminiCalls - before, 2, 'the duplicate stem forces exactly one top-up call on top of the first attempt');
    assert.ok(b2.added < 5, 'the stuck duplicate keeps this batch short even after the one allowed top-up');

    const stems = await db.query('SELECT question FROM quiz_questions WHERE quiz_id = ?', [started.quizId]);
    const dupeCount = stems.filter((r) => r.question === 'Duplicate stem?').length;
    assert.equal(dupeCount, 1, 'the duplicate question is saved only once across both batches');
  });

  await t.test('ABANDONED QUIZ: unstarted generation is never startable or searchable; a partial one self-heals on first use', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} abandoned`, quizType: 'multiple_choice', itemCount: 25, difficulty: 'medium',
    });

    await assert.rejects(
      () => quizService.startAttempt(A.id, started.quizId),
      (e) => e.statusCode === 409,
      'a zero-question quiz can never be started'
    );

    const found = await quizService.searchQuizzes(A.id, `${TAG} abandoned`);
    assert.equal(found.length, 0, 'a zero-question quiz is never listed in search');

    // Generation gets abandoned partway (one batch landed, "finish" never called).
    await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 10 });
    const { actual, itemCount: itemCountBefore } = await quizRowCounts(started.quizId);
    assert.equal(actual, 10);
    assert.equal(itemCountBefore, 25, 'item_count still holds the unmet target before anything self-heals it');

    const attempt = await quizService.startAttempt(A.id, started.quizId);
    assert.equal(attempt.items.length, 10, 'usable with its real, partial count');
    const { itemCount: itemCountAfter } = await quizRowCounts(started.quizId);
    assert.equal(itemCountAfter, 10, 'starting an attempt self-heals item_count to match reality');
  });

  await t.test('OWNERSHIP: another student cannot append to or finish someone else\'s generating quiz', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} ownership`, quizType: 'multiple_choice', itemCount: 10, difficulty: 'medium',
    });

    await assert.rejects(
      () => quizService.appendQuizBatch({ userId: B.id, quizId: started.quizId, requestedCount: 5 }),
      (e) => e.statusCode === 404,
      'opaque 404, not 403, for a non-owner append'
    );
    await assert.rejects(
      () => quizService.finishQuizGeneration({ userId: B.id, quizId: started.quizId }),
      (e) => e.statusCode === 404,
      'opaque 404, not 403, for a non-owner finish'
    );

    // The real owner is unaffected by the rejected attempts.
    const { actual } = await quizRowCounts(started.quizId);
    assert.equal(actual, 0);
  });

  await t.test('BATCH PAST TARGET is rejected once the quiz already has its full set of questions', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} fulltarget`, quizType: 'multiple_choice', itemCount: 10, difficulty: 'medium',
    });
    const full = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 10 });
    assert.equal(full.total, 10);

    await assert.rejects(
      () => quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 5 }),
      (e) => e.statusCode === 409,
      'already has its full set of questions'
    );
  });

  await t.test('GENERATING-ONLY: once an attempt has started, no further batches can be appended', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} started`, quizType: 'multiple_choice', itemCount: 10, difficulty: 'medium',
    });
    await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 10 });
    await quizService.startAttempt(A.id, started.quizId);

    await assert.rejects(
      () => quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 1 }),
      (e) => e.statusCode === 409,
      'a quiz with an attempt already underway can no longer be extended'
    );
  });

  await t.test('BOUNDS: a quiz cannot be batch-called past MAX_BATCH_CALLS_PER_QUIZ', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} callcap`, quizType: 'multiple_choice', itemCount: 150, difficulty: 'medium',
    });

    for (let i = 0; i < quizService.MAX_BATCH_CALLS_PER_QUIZ; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 1 });
      assert.equal(result.added, 1);
    }

    await assert.rejects(
      () => quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, requestedCount: 1 }),
      (e) => e.statusCode === 429,
      `the ${quizService.MAX_BATCH_CALLS_PER_QUIZ + 1}th call for this quiz is rejected`
    );

    const { actual } = await quizRowCounts(started.quizId);
    assert.equal(actual, quizService.MAX_BATCH_CALLS_PER_QUIZ, 'well short of the 150 target, the cap triggers on call count, not completion');
  });

  await t.test('CONCURRENCY-SAFE ORDERING: 3 concurrent batches on one quiz never collide on order_index', async () => {
    const counter = { n: 0 };
    responder = uniqueItemsResponder(counter);

    const started = await quizService.startBatchedQuizGeneration({
      userId: A.id, topic: `${TAG} concurrent`, quizType: 'multiple_choice', itemCount: 45, difficulty: 'medium',
    });
    assert.equal(started.subtopics.length, 3, 'ceil(45/15) = 3 batches, matching the frontend\'s up-to-3-concurrent flow');

    const results = await Promise.all(started.subtopics.map((subtopic) => (
      quizService.appendQuizBatch({ userId: A.id, quizId: started.quizId, subtopic, requestedCount: 15 })
    )));
    results.forEach((r) => assert.equal(r.added, 15));

    const { actual, itemCount } = await quizRowCounts(started.quizId);
    assert.equal(actual, 45);

    const rows = await db.query('SELECT order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [started.quizId]);
    const indices = rows.map((r) => r.order_index);
    assert.deepEqual(indices, Array.from({ length: 45 }, (_, i) => i), 'no gaps and no collisions across the 3 concurrent transactions');

    await quizService.finishQuizGeneration({ userId: A.id, quizId: started.quizId });
    const after = await quizRowCounts(started.quizId);
    assert.equal(after.itemCount, 45);
    void itemCount;
  });
});
