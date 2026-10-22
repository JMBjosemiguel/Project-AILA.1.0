'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.activityview.${Date.now()}`;

// One-item MCQ practice quiz owned by `userId`. Correct answer: Paris.
async function makeQuiz(userId, topic) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)",
    [userId, topic]
  );
  const quizId = q.insertId;
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Capital of France?', ?, 'Paris', 'Paris since 987.', 0)",
    [quizId, JSON.stringify(['Paris', 'Berlin', 'Rome', 'Madrid'])]
  );
  const rows = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [quizId]);
  return { quizId, questionId: rows[0].id };
}

// Starts an attempt, answers it, submits it, and returns both the attemptId
// and the dashboard_activity_log row id that submission logged.
async function submitQuiz(token, userId, quizId, questionId, answer = 'Paris') {
  const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token });
  const attemptId = start.json.data.attempt.id;
  await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token, body: { questionId, selectedAnswer: answer } });
  await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token });

  const activity = await db.query(
    "SELECT id, created_at FROM dashboard_activity_log WHERE user_id = ? AND activity_type = 'quiz_completed' AND reference_id = ? ORDER BY id DESC LIMIT 1",
    [userId, quizId]
  );
  return { attemptId, activityId: activity[0].id };
}

test('Recent activity "View" button — activity -> attempt resolution', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const student = await createStudent(TAG, 'a');
  const other = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  await t.test('resolves a quiz_completed activity to its own attempt, and the existing attempt endpoint returns the full review', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} basic`);
    const { attemptId, activityId } = await submitQuiz(student.token, student.id, quizId, questionId);

    const resolved = await api('GET', `/quizzes/activity/${activityId}/attempt`, { token: student.token });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.data.attemptId, attemptId);

    const review = await api('GET', `/quizzes/attempts/${resolved.json.data.attemptId}`, { token: student.token });
    assert.equal(review.status, 200);
    assert.equal(review.json.data.status, 'submitted');
    assert.equal(review.json.data.items[0].correctAnswer, 'Paris');
  });

  await t.test('a retake resolves each activity row to ITS OWN attempt, not just the most recent one', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} retake`);
    const first = await submitQuiz(student.token, student.id, quizId, questionId, 'Berlin');
    const second = await submitQuiz(student.token, student.id, quizId, questionId, 'Paris');
    assert.notEqual(first.attemptId, second.attemptId);

    // Backdate the first submission (attempt + its activity row) well clear of
    // the second, so the match is unambiguous regardless of how fast the two
    // real submissions above actually ran.
    await db.query("UPDATE quiz_attempts SET completed_at = DATE_SUB(completed_at, INTERVAL 10 MINUTE) WHERE id = ?", [first.attemptId]);
    await db.query("UPDATE dashboard_activity_log SET created_at = DATE_SUB(created_at, INTERVAL 10 MINUTE) WHERE id = ?", [first.activityId]);

    const resolvedFirst = await api('GET', `/quizzes/activity/${first.activityId}/attempt`, { token: student.token });
    assert.equal(resolvedFirst.json.data.attemptId, first.attemptId, 'the older activity maps to the older attempt');

    const resolvedSecond = await api('GET', `/quizzes/activity/${second.activityId}/attempt`, { token: student.token });
    assert.equal(resolvedSecond.json.data.attemptId, second.attemptId, 'the newer activity maps to the newer attempt');
  });

  await t.test('OWNERSHIP — another student resolving the same activity id gets 404', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} owner`);
    const { activityId } = await submitQuiz(student.token, student.id, quizId, questionId);

    const asOther = await api('GET', `/quizzes/activity/${activityId}/attempt`, { token: other.token });
    assert.equal(asOther.status, 404);
  });

  await t.test('a non-quiz activity row (lesson/resource/task) 404s — "View" never applies to it', async () => {
    const fake = await db.query(
      "INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, 'resource_viewed', 1, 'Viewed resource: Notes.pdf')",
      [student.id]
    );
    const res = await api('GET', `/quizzes/activity/${fake.insertId}/attempt`, { token: student.token });
    assert.equal(res.status, 404);
  });

  await t.test('a deleted quiz (and its cascade-deleted attempts) reports "This quiz is no longer available."', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} deleted`);
    const { activityId } = await submitQuiz(student.token, student.id, quizId, questionId);

    await db.query('DELETE FROM quizzes WHERE id = ?', [quizId]);

    const res = await api('GET', `/quizzes/activity/${activityId}/attempt`, { token: student.token });
    assert.equal(res.status, 404);
    assert.match(res.json.message, /no longer available/i);
  });

  await t.test('resolving + reviewing is pure read — no new rows, no XP, no analytics side effects', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} noside`);
    const { attemptId, activityId } = await submitQuiz(student.token, student.id, quizId, questionId);

    const before = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM dashboard_activity_log WHERE user_id = ?', [student.id]),
      db.query('SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id = ?', [student.id]),
      db.query('SELECT COUNT(*) AS c FROM xp_events WHERE user_id = ?', [student.id]),
    ]);

    await api('GET', `/quizzes/activity/${activityId}/attempt`, { token: student.token });
    await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token });

    const after = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM dashboard_activity_log WHERE user_id = ?', [student.id]),
      db.query('SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id = ?', [student.id]),
      db.query('SELECT COUNT(*) AS c FROM xp_events WHERE user_id = ?', [student.id]),
    ]);

    before.forEach((rows, i) => assert.equal(Number(after[i][0].c), Number(rows[0].c), `table index ${i} row count unchanged`));
  });
});
