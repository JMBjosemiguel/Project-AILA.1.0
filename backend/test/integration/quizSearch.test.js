'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.search.${Date.now()}`;

function searchUrl(term) {
  return `/quizzes/search?search=${encodeURIComponent(term)}`;
}

test('quiz search — ownership and privacy', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test("finds the authenticated user's own quiz by topic, case-insensitively", async () => {
    await db.query(
      "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)",
      [A.id, `${TAG} Cell Biology Quiz`]
    );

    const res = await api('GET', searchUrl('cell BIOLOGY'), { token: A.token });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.quizzes.some((q) => q.topic === `${TAG} Cell Biology Quiz`));
  });

  await t.test("never returns another student's quizzes, even an unlisted/shared one", async () => {
    await db.query(
      "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count, visibility) VALUES (?, ?, 'multiple_choice', 'medium', 1, 'unlisted')",
      [B.id, `${TAG} Shared World History Quiz`]
    );

    const res = await api('GET', searchUrl('world history'), { token: A.token });
    assert.equal(res.status, 200);
    assert.ok(!res.json.data.quizzes.some((quiz) => quiz.topic.includes(TAG)));
  });

  await t.test('a blank search returns an empty list rather than every quiz', async () => {
    const res = await api('GET', searchUrl(''), { token: A.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data.quizzes, []);
  });

  await t.test('a term matching nothing returns an empty list, not an error', async () => {
    const res = await api('GET', searchUrl('zzz-nonexistent-topic'), { token: A.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data.quizzes, []);
  });

  await t.test('requires authentication', async () => {
    assert.equal((await api('GET', searchUrl('cell'))).status, 401);
  });
});
