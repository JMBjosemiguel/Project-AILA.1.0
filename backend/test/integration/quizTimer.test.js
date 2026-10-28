'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');

const TAG = `qa.itest.quiztimer.${Date.now()}`;
let quizCount = 0;

// Two-question multiple-choice quiz owned by userId; Q1's answer is 'right'.
async function makeQuiz(userId, sourceType) {
  quizCount += 1;
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, item_count) VALUES (?, ?, 'multiple_choice', 'medium', ?, 2)",
    [userId, `${TAG} Quiz ${quizCount}`, sourceType]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q1', ?, 'right', 'why', 0), (?, 'Q2', ?, 'four', 'math', 1)",
    [q.insertId, JSON.stringify(['right', 'wrong']), q.insertId, JSON.stringify(['three', 'four'])]
  );
  const questions = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [q.insertId]);
  return { id: q.insertId, q1: questions[0].id, q2: questions[1].id };
}

// Moves the deadline into the past, as if the time limit had run out.
async function expire(attemptId) {
  await db.query('UPDATE quiz_attempts SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE id = ?', [attemptId]);
}

async function attemptRow(attemptId) {
  const [row] = await db.query(
    'SELECT status, score, total, time_limit_seconds, tab_switch_count, completed_at, TIMESTAMPDIFF(SECOND, started_at, expires_at) AS limit_span FROM quiz_attempts WHERE id = ?',
    [attemptId]
  );
  return row;
}

test('quiz timer and tab switches', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const adminToken = await loginAdmin();
  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');
  const start = (quizId, body, token = A.token) => api('POST', `/quizzes/${quizId}/attempts/start`, { token, body });
  const save = (attemptId, questionId, selectedAnswer) => api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: A.token, body: { questionId, selectedAnswer } });
  const tabSwitch = (attemptId, token = A.token) => api('POST', `/quizzes/attempts/${attemptId}/tab-switch`, { token });

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  let tabAttemptId;

  await t.test('a Learning Hub quiz asks for a time limit first and creates no attempt', async () => {
    const quiz = await makeQuiz(A.id, 'lesson');
    const res = await start(quiz.id, {});
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.data.needsTimeLimit, true);
    assert.deepEqual(res.json.data.timeLimitOptions, [5, 10, 15, 20, 30, 45, 60]);
    const [{ c }] = await db.query('SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ?', [quiz.id]);
    assert.equal(Number(c), 0);
  });

  await t.test('a time limit that is not on the list is a 422 field error', async () => {
    const quiz = await makeQuiz(A.id, 'resource');
    for (const timeLimitMinutes of [7, 'abc', 0]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await start(quiz.id, { timeLimitMinutes });
      assert.equal(res.status, 422, JSON.stringify(timeLimitMinutes));
      assert.ok(res.json.details.some((d) => d.field === 'timeLimitMinutes'));
    }
  });

  await t.test('a chosen limit is stored, expires_at = start + limit, and the server returns the remaining time', async () => {
    const quiz = await makeQuiz(A.id, 'resource');
    const res = await start(quiz.id, { timeLimitMinutes: 5 });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const { attempt, quiz: quizInfo } = res.json.data;
    assert.equal(quizInfo.timerEligible, true);
    assert.equal(attempt.timeLimitSeconds, 300);
    assert.ok(attempt.remainingSeconds > 290 && attempt.remainingSeconds <= 300, String(attempt.remainingSeconds));
    const row = await attemptRow(attempt.id);
    assert.equal(Number(row.time_limit_seconds), 300);
    assert.equal(Number(row.limit_span), 300);

    const again = await start(quiz.id, { timeLimitMinutes: 60 });
    assert.equal(again.json.data.attempt.id, attempt.id, 'resumes the same attempt');
    assert.equal(again.json.data.attempt.timeLimitSeconds, 300, 'the limit cannot be changed after starting');
    assert.ok(again.json.data.attempt.remainingSeconds <= attempt.remainingSeconds, 'a resume never resets the clock');
  });

  await t.test('after the deadline, saves are rejected and fetching the attempt auto-submits it as timed out', async () => {
    const quiz = await makeQuiz(A.id, 'lesson');
    const { attempt } = (await start(quiz.id, { timeLimitMinutes: 10 })).json.data;
    assert.equal((await save(attempt.id, quiz.q1, 'right')).status, 200);

    await expire(attempt.id);
    const late = await save(attempt.id, quiz.q2, 'four');
    assert.equal(late.status, 409, JSON.stringify(late.json));
    assert.equal(late.json.details.code, 'ATTEMPT_EXPIRED');
    const [lateRow] = await db.query('SELECT COUNT(*) AS c FROM quiz_attempt_answers WHERE attempt_id = ? AND question_id = ? AND selected_answer IS NOT NULL', [attempt.id, quiz.q2]);
    assert.equal(Number(lateRow.c), 0, 'the late answer was not saved');

    const fetched = await api('GET', `/quizzes/attempts/${attempt.id}`, { token: A.token });
    assert.equal(fetched.status, 200, JSON.stringify(fetched.json));
    assert.equal(fetched.json.data.status, 'submitted');
    assert.equal(fetched.json.data.timedOut, true);
    assert.equal(fetched.json.data.score, 1, 'graded from the answers saved in time');
    assert.equal(fetched.json.data.total, 2);

    const row = await attemptRow(attempt.id);
    assert.equal(row.status, 'submitted');
    assert.ok(row.completed_at);
    const xp = await db.query('SELECT points FROM xp_events WHERE user_id = ? AND event_key = ?', [A.id, `quiz_completed:${quiz.id}`]);
    assert.equal(xp.length, 1, 'XP is awarded as usual');
    const activity = await db.query("SELECT id FROM dashboard_activity_log WHERE user_id = ? AND activity_type = 'quiz_completed' AND reference_id = ?", [A.id, quiz.id]);
    assert.equal(activity.length, 1, 'counts in activity/analytics as usual');

    const reread = await api('GET', `/quizzes/attempts/${attempt.id}`, { token: A.token });
    assert.equal(reread.json.data.timedOut, true, 'stays marked as timed out');
  });

  await t.test('resuming an expired attempt auto-submits it and returns the review; a new attempt can then start', async () => {
    const quiz = await makeQuiz(A.id, 'topic');
    const { attempt } = (await start(quiz.id, { timeLimitMinutes: 15 })).json.data;
    await save(attempt.id, quiz.q2, 'four');
    await expire(attempt.id);

    const resumed = await start(quiz.id, {});
    assert.equal(resumed.status, 200, JSON.stringify(resumed.json));
    assert.equal(resumed.json.data.timedOut, true);
    assert.equal(resumed.json.data.review.timedOut, true);
    assert.equal(resumed.json.data.review.score, 1);
    assert.equal((await attemptRow(attempt.id)).status, 'submitted');

    const next = await start(quiz.id, {});
    assert.equal(next.json.data.needsTimeLimit, true, 'a fresh attempt asks for a limit again');
  });

  await t.test('submitting at/after the deadline grades normally and is marked timed out; before it, not', async () => {
    const late = await makeQuiz(A.id, 'lesson');
    const lateAttempt = (await start(late.id, { timeLimitMinutes: 5 })).json.data.attempt;
    await save(lateAttempt.id, late.q1, 'right');
    await expire(lateAttempt.id);
    const lateSubmit = await api('POST', `/quizzes/attempts/${lateAttempt.id}/submit`, { token: A.token });
    assert.equal(lateSubmit.status, 200, JSON.stringify(lateSubmit.json));
    assert.equal(lateSubmit.json.data.timedOut, true);
    assert.equal(lateSubmit.json.data.score, 1);

    const onTime = await makeQuiz(A.id, 'lesson');
    const onTimeAttempt = (await start(onTime.id, { timeLimitMinutes: 5 })).json.data.attempt;
    const onTimeSubmit = await api('POST', `/quizzes/attempts/${onTimeAttempt.id}/submit`, { token: A.token });
    assert.equal(onTimeSubmit.json.data.timedOut, false);

    const noLimit = await makeQuiz(A.id, 'lesson');
    const noLimitAttempt = (await start(noLimit.id, { timeLimitMinutes: null })).json.data.attempt;
    assert.equal(noLimitAttempt.timeLimitSeconds, null);
    assert.equal(noLimitAttempt.remainingSeconds, null);
    assert.equal((await attemptRow(noLimitAttempt.id)).limit_span, null, 'no expires_at without a limit');
  });

  await t.test('tab switches count only while the attempt is in progress, and only for the owner', async () => {
    const quiz = await makeQuiz(A.id, 'lesson');
    const { attempt } = (await start(quiz.id, { timeLimitMinutes: null })).json.data;
    tabAttemptId = attempt.id;

    assert.deepEqual((await tabSwitch(attempt.id)).json.data, { recorded: true, tabSwitchCount: 1 });
    assert.deepEqual((await tabSwitch(attempt.id)).json.data, { recorded: true, tabSwitchCount: 2 });
    assert.equal((await tabSwitch(attempt.id, B.token)).status, 404, "another student can't touch it");

    await api('POST', `/quizzes/attempts/${attempt.id}/submit`, { token: A.token });
    assert.deepEqual((await tabSwitch(attempt.id)).json.data, { recorded: false, tabSwitchCount: 2 });
    assert.equal(Number((await attemptRow(attempt.id)).tab_switch_count), 2);
    const review = await api('GET', `/quizzes/attempts/${attempt.id}`, { token: A.token });
    assert.equal(review.json.data.tabSwitchCount, 2);

    const timed = await makeQuiz(A.id, 'resource');
    const timedAttempt = (await start(timed.id, { timeLimitMinutes: 5 })).json.data.attempt;
    await expire(timedAttempt.id);
    assert.equal((await tabSwitch(timedAttempt.id)).json.data.recorded, false, 'not counted after the deadline');
  });

  await t.test('chat quizzes have no timer and record no tab switches', async () => {
    const chatQuiz = await makeQuiz(A.id, 'chat');
    const first = await start(chatQuiz.id, {});
    assert.equal(first.json.data.needsTimeLimit, undefined, 'no time-limit step');
    assert.equal(first.json.data.quiz.timerEligible, false);
    assert.equal(first.json.data.attempt.timeLimitSeconds, null);

    const other = await makeQuiz(A.id, 'chat');
    const withLimit = (await start(other.id, { timeLimitMinutes: 5 })).json.data.attempt;
    assert.equal(withLimit.timeLimitSeconds, null, 'a limit sent for a chat quiz is ignored');
    const row = await attemptRow(withLimit.id);
    assert.equal(row.time_limit_seconds, null);
    assert.equal(row.limit_span, null);

    assert.deepEqual((await tabSwitch(first.json.data.attempt.id)).json.data, { recorded: false, tabSwitchCount: 0 });
  });

  await t.test('the admin sees each attempt\'s tab-switch count, time limit and timed-out mark in the user\'s details', async () => {
    const res = await api('GET', `/admin/users/${A.id}`, { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const attempts = res.json.data.recentAttempts;
    const tabRow = attempts.find((a) => a.id === tabAttemptId);
    assert.ok(tabRow, 'the tab-switch attempt is listed');
    assert.equal(tabRow.tab_switch_count, 2);
    // The 10 most recent attempts include the late submit from the deadline test (5-min limit).
    assert.ok(attempts.some((a) => a.timed_out === true && a.time_limit_seconds === 300 && a.status === 'submitted'), JSON.stringify(attempts));
    assert.ok(attempts.some((a) => a.timed_out === false && a.status === 'submitted'));
    const chatIds = (await db.query("SELECT qa.id FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE qa.user_id = ? AND q.source_type = 'chat'", [A.id])).map((r) => r.id);
    assert.ok(attempts.every((a) => !chatIds.includes(a.id)), 'chat quiz attempts are left out');
  });
});
