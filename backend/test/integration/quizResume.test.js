'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.resume.${Date.now()}`;

// Two-item MCQ quiz owned by `userId`. correct answers: Paris, 4.
async function makeQuiz(userId, topic) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 2)",
    [userId, topic]
  );
  const quizId = q.insertId;
  await db.query(
    'INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
    [
      quizId, 'Capital of France?', JSON.stringify(['Paris', 'Berlin', 'Rome', 'Madrid']), 'Paris', 'Paris has been the capital since 987.', 0,
      quizId, '2 + 2 = ?', JSON.stringify(['3', '4', '5', '22']), '4', 'Basic arithmetic.', 1,
    ]
  );
  const rows = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [quizId]);
  return { quizId, questionIds: rows.map((r) => r.id) };
}

const bodyOf = (res) => JSON.stringify(res.json);
const leaksKey = (res) => /correct_?answer|correctAnswer|explanation|is_?correct|isCorrect|987|Basic arithmetic/i.test(bodyOf(res));

test('resumable formal quiz attempts', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const student = await createStudent(TAG, 'a');
  const other = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  await t.test('START creates one IN_PROGRESS attempt and is idempotent', async () => {
    const { quizId } = await makeQuiz(student.id, `${TAG} start`);

    const first = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    assert.equal(first.status, 200);
    assert.equal(first.json.data.attempt.status, 'in_progress');
    assert.ok(first.json.data.attempt.id);
    assert.equal(first.json.data.items.length, 2);
    assert.equal(first.json.data.answers.length, 0);
    assert.ok(!leaksKey(first), 'start payload must not expose the answer key');

    const second = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    assert.equal(second.status, 200);
    assert.equal(second.json.data.attempt.id, first.json.data.attempt.id, 'the same active attempt is returned');

    const rows = await db.query("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND status = 'in_progress'", [quizId]);
    assert.equal(Number(rows[0].c), 1);
  });

  await t.test('concurrent START does not create two active attempts', async () => {
    const { quizId } = await makeQuiz(student.id, `${TAG} race`);
    const results = await Promise.all([
      api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token }),
      api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token }),
      api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token }),
    ]);
    const ids = new Set(results.map((r) => r.json.data.attempt.id));
    assert.equal(ids.size, 1, 'all concurrent starts resolve to one attempt');
    const rows = await db.query("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND status = 'in_progress'", [quizId]);
    assert.equal(Number(rows[0].c), 1);
  });

  await t.test('SAVE persists an answer without grading it, and a change overwrites it', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} save`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;

    const s1 = await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, {
      token: student.token,
      body: { questionId: questionIds[0], selectedAnswer: 'Berlin', currentIndex: 0 },
    });
    assert.equal(s1.status, 200);
    assert.equal(s1.json.data.saved, true);

    let row = await db.query('SELECT selected_answer, is_correct FROM quiz_attempt_answers WHERE attempt_id = ? AND question_id = ?', [attemptId, questionIds[0]]);
    assert.equal(row[0].selected_answer, 'Berlin');
    assert.equal(row[0].is_correct, null, 'ungraded until submission');

    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, {
      token: student.token,
      body: { questionId: questionIds[0], selectedAnswer: 'Paris', currentIndex: 1 },
    });
    row = await db.query('SELECT selected_answer FROM quiz_attempt_answers WHERE attempt_id = ? AND question_id = ?', [attemptId, questionIds[0]]);
    assert.equal(row[0].selected_answer, 'Paris');
    const rows = await db.query('SELECT COUNT(*) AS c FROM quiz_attempt_answers WHERE attempt_id = ?', [attemptId]);
    assert.equal(Number(rows[0].c), 1, 'still one row for that question (UPSERT)');
  });

  await t.test('SAVE rejects a question that is not in this quiz', async () => {
    const { quizId } = await makeQuiz(student.id, `${TAG} badq`);
    const otherQuiz = await makeQuiz(student.id, `${TAG} badq-other`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;

    const bogus = await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, {
      token: student.token, body: { questionId: 999999999, selectedAnswer: 'x' },
    });
    assert.equal(bogus.status, 400);

    const crossQuiz = await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, {
      token: student.token, body: { questionId: otherQuiz.questionIds[0], selectedAnswer: 'Paris' },
    });
    assert.equal(crossQuiz.status, 400);

    const badOption = await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, {
      token: student.token, body: { questionId: (await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ? LIMIT 1', [quizId]))[0].id, selectedAnswer: 'Atlantis' },
    });
    assert.equal(badOption.status, 400, 'an answer outside the option list is rejected');
  });

  await t.test('RESUME restores saved answers + position and never exposes the key', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} resume`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris', currentIndex: 1 } });
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[1], selectedAnswer: '5', currentIndex: 1 } });

    // A brand new request/session — just fetch the attempt by id.
    const resumed = await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.json.data.attempt.status, 'in_progress');
    assert.equal(resumed.json.data.attempt.currentIndex, 1);
    const answers = new Map(resumed.json.data.answers.map((a) => [a.questionId, a.selectedAnswer]));
    assert.equal(answers.get(questionIds[0]), 'Paris');
    assert.equal(answers.get(questionIds[1]), '5');
    assert.ok(!leaksKey(resumed), 'resume payload must not expose correct answers or explanations');
  });

  await t.test('SUBMIT grades server-side, freezes the attempt, returns explanations', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} submit`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } });
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[1], selectedAnswer: '5' } });

    const submitted = await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: student.token });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.json.data.score, 1);
    assert.equal(submitted.json.data.total, 2);
    const items = submitted.json.data.items;
    assert.equal(items[0].isCorrect, true);
    assert.equal(items[0].correctAnswer, 'Paris');
    assert.equal(items[1].isCorrect, false);
    assert.equal(items[1].correctAnswer, '4');
    assert.match(items[1].explanation, /arithmetic/i);

    const row = await db.query('SELECT status, completed_at, active_slot, current_index FROM quiz_attempts WHERE id = ?', [attemptId]);
    assert.equal(row[0].status, 'submitted');
    assert.ok(row[0].completed_at, 'completed_at is set');
    assert.equal(row[0].active_slot, null, 'active slot cleared so a retake can start');
    const graded = await db.query('SELECT COUNT(*) AS c FROM quiz_attempt_answers WHERE attempt_id = ? AND is_correct IS NOT NULL', [attemptId]);
    assert.equal(Number(graded[0].c), 2, 'every answer is graded');

    // Immutability: no more writes, no re-submit.
    const resubmit = await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: student.token });
    assert.equal(resubmit.status, 409);
    const latePatch = await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Berlin' } });
    assert.equal(latePatch.status, 409);
    const stillParis = await db.query('SELECT selected_answer FROM quiz_attempt_answers WHERE attempt_id = ? AND question_id = ?', [attemptId, questionIds[0]]);
    assert.equal(stillParis[0].selected_answer, 'Paris', 'submitted answers cannot change');
  });

  await t.test('GET on a submitted attempt returns the full review', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} review`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } });
    await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: student.token });

    const review = await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token });
    assert.equal(review.status, 200);
    assert.equal(review.json.data.status, 'submitted');
    assert.equal(review.json.data.items[0].correctAnswer, 'Paris');
    assert.ok('explanation' in review.json.data.items[0]);
  });

  await t.test('OWNERSHIP — another student cannot touch the attempt', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} own`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;

    assert.equal((await api('GET', `/quizzes/attempts/${attemptId}`, { token: other.token })).status, 404);
    assert.equal((await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: other.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } })).status, 404);
    assert.equal((await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: other.token })).status, 404);
    assert.equal((await api('POST', `/quizzes/${quizId}/attempts/start`, { token: other.token })).status, 404, 'cannot start an attempt on a quiz you do not own');
  });

  await t.test('RETAKE — a new attempt starts after submit, old history stays, XP is not farmed', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} retake`);
    const xpBefore = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [student.id]))[0].xp_points;
    // One-time achievement bonuses (migration 006) also move the cached total.
    const achBefore = Number((await db.query("SELECT COALESCE(SUM(points),0) s FROM xp_events WHERE user_id = ? AND event_key LIKE 'achievement:%'", [student.id]))[0].s);

    const a1 = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const id1 = a1.json.data.attempt.id;
    await api('PATCH', `/quizzes/attempts/${id1}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } });
    await api('PATCH', `/quizzes/attempts/${id1}/answers`, { token: student.token, body: { questionId: questionIds[1], selectedAnswer: '4' } });
    const sub1 = await api('POST', `/quizzes/attempts/${id1}/submit`, { token: student.token });
    assert.equal(sub1.json.data.xpAwarded, 20, 'first perfect completion earns XP');

    const a2 = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const id2 = a2.json.data.attempt.id;
    assert.notEqual(id2, id1, 'a fresh attempt');
    await api('PATCH', `/quizzes/attempts/${id2}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } });
    await api('PATCH', `/quizzes/attempts/${id2}/answers`, { token: student.token, body: { questionId: questionIds[1], selectedAnswer: '4' } });
    const sub2 = await api('POST', `/quizzes/attempts/${id2}/submit`, { token: student.token });
    assert.equal(sub2.json.data.xpAwarded, 0, 'the retake farms no XP');

    const xpAfter = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [student.id]))[0].xp_points;
    const achAfter = Number((await db.query("SELECT COALESCE(SUM(points),0) s FROM xp_events WHERE user_id = ? AND event_key LIKE 'achievement:%'", [student.id]))[0].s);
    assert.equal(xpAfter, xpBefore + 20 + (achAfter - achBefore), 'only the first completion (+20) and any new achievement bonuses moved XP');
    const attempts = await db.query("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND status = 'submitted'", [quizId]);
    assert.equal(Number(attempts[0].c), 2, 'both attempts are kept in history');
    const led = await db.query("SELECT COUNT(*) AS c FROM xp_events WHERE user_id = ? AND event_key = ?", [student.id, `quiz_completed:${quizId}`]);
    assert.equal(Number(led[0].c), 1, 'exactly one XP ledger row for this quiz');
  });

  await t.test('the dashboard surfaces the active attempt for a Resume Test widget', async () => {
    const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} dash`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    await api('PATCH', `/quizzes/attempts/${start.json.data.attempt.id}/answers`, { token: student.token, body: { questionId: questionIds[0], selectedAnswer: 'Paris' } });

    const summary = await api('GET', '/dashboard/summary', { token: student.token });
    assert.equal(summary.status, 200);
    const active = (summary.json.data.activeQuizAttempts || []).find((a) => a.quizId === quizId);
    assert.ok(active, 'the in-progress attempt is listed');
    assert.equal(active.total, 2);
    assert.equal(active.answered, 1);
    assert.equal(active.progressPercent, 50);
    assert.ok(!/correct_?answer|explanation/i.test(JSON.stringify(active)));
  });
});
