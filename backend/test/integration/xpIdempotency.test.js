'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.xp.${Date.now()}`;

async function makePerfectQuiz(userId, topic) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)",
    [userId, topic]
  );
  const quizId = q.insertId;
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q', ?, 'Yes', 'because', 0)",
    [quizId, JSON.stringify(['Yes', 'No'])]
  );
  const [{ id: questionId }] = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  return { quizId, questionId };
}

async function xp(userId) {
  const [row] = await db.query('SELECT xp_points, level FROM user_profiles WHERE user_id = ?', [userId]);
  return row;
}
async function ledgerCount(userId, eventKey) {
  const [row] = await db.query('SELECT COUNT(*) AS c, COALESCE(SUM(points),0) AS s FROM xp_events WHERE user_id = ? AND event_key = ?', [userId, eventKey]);
  return { c: Number(row.c), s: Number(row.s) };
}
// One-time achievement XP bonuses (migration 006) also land in xp_events and move
// the cached total, so tests that assert an exact XP delta net them out here.
async function achievementXp(userId) {
  const [row] = await db.query("SELECT COALESCE(SUM(points),0) AS s FROM xp_events WHERE user_id = ? AND event_key LIKE 'achievement:%'", [userId]);
  return Number(row.s);
}

test('quiz XP is idempotent', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  const perfectAnswer = async (quizId, questionId, token) => api('POST', `/quizzes/${quizId}/attempts`, {
    token,
    body: { answers: [{ questionId, selectedAnswer: 'Yes' }] },
  });

  await t.test('first perfect completion awards XP and records one ledger row', async () => {
    const { quizId, questionId } = await makePerfectQuiz(A.id, `${TAG} first`);
    const before = await xp(A.id);
    const achBefore = await achievementXp(A.id);
    const res = await perfectAnswer(quizId, questionId, A.token);
    assert.equal(res.status, 201);
    assert.equal(res.json.data.xpAwarded, 20);

    const after = await xp(A.id);
    assert.equal(after.xp_points, before.xp_points + 20 + (await achievementXp(A.id)) - achBefore);
    const led = await ledgerCount(A.id, `quiz_completed:${quizId}`);
    assert.equal(led.c, 1);
    assert.equal(led.s, 20);
  });

  await t.test('retaking the same quiz awards no further XP', async () => {
    const { quizId, questionId } = await makePerfectQuiz(A.id, `${TAG} retake`);
    await perfectAnswer(quizId, questionId, A.token);
    const mid = await xp(A.id);

    const res2 = await perfectAnswer(quizId, questionId, A.token);
    assert.equal(res2.status, 201);
    assert.equal(res2.json.data.xpAwarded, 0);
    const res3 = await perfectAnswer(quizId, questionId, A.token);
    assert.equal(res3.json.data.xpAwarded, 0);

    assert.equal((await xp(A.id)).xp_points, mid.xp_points);
    assert.equal((await ledgerCount(A.id, `quiz_completed:${quizId}`)).c, 1);
    // but every attempt is still recorded for history
    const [{ c: attemptCount }] = await db.query('SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ?', [quizId]);
    assert.equal(attemptCount, 3);
  });

  await t.test('a different quiz awards separately', async () => {
    const q1 = await makePerfectQuiz(A.id, `${TAG} q1`);
    const q2 = await makePerfectQuiz(A.id, `${TAG} q2`);
    const before = await xp(A.id);
    await perfectAnswer(q1.quizId, q1.questionId, A.token);
    await perfectAnswer(q2.quizId, q2.questionId, A.token);
    assert.equal((await xp(A.id)).xp_points, before.xp_points + 40);
  });

  await t.test('two concurrent submits of one fresh quiz award XP exactly once', async () => {
    const { quizId, questionId } = await makePerfectQuiz(A.id, `${TAG} race`);
    const before = await xp(A.id);
    const achBefore = await achievementXp(A.id);
    const [r1, r2] = await Promise.all([
      perfectAnswer(quizId, questionId, A.token),
      perfectAnswer(quizId, questionId, A.token),
    ]);
    const awarded = [r1.json.data.xpAwarded, r2.json.data.xpAwarded].sort();
    assert.deepEqual(awarded, [0, 20], 'exactly one of the two concurrent submits awards XP');
    assert.equal((await xp(A.id)).xp_points, before.xp_points + 20 + (await achievementXp(A.id)) - achBefore);
    assert.equal((await ledgerCount(A.id, `quiz_completed:${quizId}`)).c, 1);
  });

  await t.test('a different user has an independent XP namespace', async () => {
    const { quizId, questionId } = await makePerfectQuiz(B.id, `${TAG} for-b`);
    const beforeB = await xp(B.id);
    const achBeforeB = await achievementXp(B.id);
    const beforeA = await xp(A.id);
    await perfectAnswer(quizId, questionId, B.token);
    assert.equal((await xp(B.id)).xp_points, beforeB.xp_points + 20 + (await achievementXp(B.id)) - achBeforeB);
    assert.equal((await xp(A.id)).xp_points, beforeA.xp_points, "student A's XP is untouched");
  });

  await t.test('the xp_events unique constraint rejects a duplicate at the DB level', async () => {
    await db.query("INSERT INTO xp_events (user_id, event_key, points) VALUES (?, 'dup_test', 5)", [A.id]);
    await assert.rejects(
      () => db.query("INSERT INTO xp_events (user_id, event_key, points) VALUES (?, 'dup_test', 5)", [A.id]),
      /ER_DUP_ENTRY|Duplicate/i
    );
    const ignored = await db.query("INSERT IGNORE INTO xp_events (user_id, event_key, points) VALUES (?, 'dup_test', 5)", [A.id]);
    assert.equal(ignored.affectedRows, 0);
  });
});
