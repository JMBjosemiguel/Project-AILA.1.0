'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');

const TAG = `qa.itest.weekly.${Date.now()}`;
const subjectIds = [];

async function makeQuiz(userId, sourceType, sourceId = null) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, source_id, item_count) VALUES (?, ?, 'multiple_choice', 'medium', ?, ?, 4)",
    [userId, `${TAG} ${sourceType} quiz`, sourceType, sourceId]
  );
  return q.insertId;
}

async function addAttempt(userId, quizId, { status = 'submitted', score = 0, total = 4, completedAt = new Date() } = {}) {
  const r = await db.query(
    'INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [quizId, userId, score, total, status, completedAt || new Date(), status === 'submitted' ? completedAt : null]
  );
  return r.insertId;
}

async function makeCourse(userId) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course`]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module 1']);
  const tp = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, `${TAG} Fluid balance`]);
  const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, 'x', 'medium')", [tp.insertId, 'Lesson 1']);
  return { topicId: tp.insertId, lessonId: l.insertId };
}

// modules -> subjects has no ON DELETE CASCADE, so courses go before purgeByTag.
async function wipeCourse(subjectId) {
  const tail = 'JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id ${tail}`, [subjectId]).catch(() => {});
  await db.query(`DELETE l FROM lessons l ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE lp FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

test('admin weekly results and the study-focused dashboard', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const adminToken = await loginAdmin();
  const A = await createStudent(TAG, 'a');
  const weekly = async () => {
    const res = await api('GET', '/admin/analytics', { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    return res.json.data;
  };

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('8 weeks, oldest first, the current one starting where the weekly leaderboard starts', async () => {
    const data = await weekly();
    // The leaderboard API is off while gamification is hidden, so read its week
    // from the service behind it (the same code the board uses).
    const board = { json: { data: await require('../../src/services/gamificationService').getLeaderboard(A.id, 'weekly') } };

    const rows = data.weeklyResults;
    assert.equal(rows.length, 8);
    assert.equal(rows[7].weekStart, board.json.data.weekStart);
    assert.equal(data.timezone, board.json.data.timezone);
    for (let i = 1; i < rows.length; i += 1) {
      const gapHours = (new Date(rows[i].weekStart) - new Date(rows[i - 1].weekStart)) / 3600000;
      assert.ok(Math.abs(gapHours - 168) <= 1, `week ${i} starts a week after week ${i - 1} (${gapHours}h)`);
    }
    for (const row of rows) {
      for (const key of ['activeStudents', 'quizzesCompleted', 'lessonsCompleted', 'newRegistrations']) {
        assert.equal(typeof row[key], 'number', key);
      }
      assert.ok(row.avgQuizScore === null || (row.avgQuizScore >= 0 && row.avgQuizScore <= 100));
    }
  });

  await t.test("counts this week's students, quizzes, lessons and sign-ups; chat quizzes and unfinished attempts are left out", async () => {
    const before = await weekly();
    const [prevBefore, nowBefore] = before.weeklyResults.slice(-2);
    const weekStart = new Date(nowBefore.weekStart);

    const B = await createStudent(TAG, 'b'); // new registration
    const lessonQuiz = await makeQuiz(B.id, 'lesson');
    const chatQuiz = await makeQuiz(B.id, 'chat');
    await addAttempt(B.id, lessonQuiz, { score: 3 });
    await addAttempt(B.id, chatQuiz, { score: 4 });
    await addAttempt(B.id, lessonQuiz, { status: 'in_progress' });
    // 1 second before this week began: last week's row.
    await addAttempt(B.id, lessonQuiz, { score: 2, completedAt: new Date(weekStart.getTime() - 1000) });
    const { lessonId } = await makeCourse(B.id);
    await db.query('INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [B.id, lessonId]);
    await db.query(
      "INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES (?, 'lesson_completed', ?, 'x'), (?, 'quiz_completed', ?, 'x')",
      [B.id, lessonId, B.id, lessonQuiz]
    );

    const after = await weekly();
    const [prevAfter, nowAfter] = after.weeklyResults.slice(-2);
    assert.equal(nowAfter.weekStart, nowBefore.weekStart);
    assert.equal(nowAfter.newRegistrations - nowBefore.newRegistrations, 1);
    assert.equal(nowAfter.quizzesCompleted - nowBefore.quizzesCompleted, 1, 'only the submitted Learning Hub attempt');
    assert.equal(nowAfter.lessonsCompleted - nowBefore.lessonsCompleted, 1);
    assert.equal(nowAfter.activeStudents - nowBefore.activeStudents, 1, 'two activity rows, one student');
    assert.equal(prevAfter.quizzesCompleted - prevBefore.quizzesCompleted, 1, 'the attempt just before Monday 00:00');
    if (nowBefore.quizzesCompleted === 0) assert.equal(nowAfter.avgQuizScore, 75);
  });

  await t.test('the resume list marks a timed attempt whose time ran out, and opening it shows the results', async () => {
    const timedQuiz = await makeQuiz(A.id, 'lesson');
    await db.query(
      "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q1', ?, 'a', 'x', 0)",
      [timedQuiz, JSON.stringify(['a', 'b'])]
    );
    const started = await api('POST', `/quizzes/${timedQuiz}/attempts/start`, { token: A.token, body: { timeLimitMinutes: 5 } });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const attemptId = started.json.data.attempt.id;

    const listed = async () => {
      const res = await api('GET', '/dashboard/summary', { token: A.token });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      return res.json.data.activeQuizAttempts.find((a) => a.attemptId === attemptId);
    };

    const running = await listed();
    assert.equal(running.expired, false);
    assert.equal(running.timeLimitSeconds, 300);
    assert.ok(running.remainingSeconds > 280 && running.remainingSeconds <= 300, `server time left, got ${running.remainingSeconds}`);

    await db.query('UPDATE quiz_attempts SET expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 252 SECOND) WHERE id = ?', [attemptId]);
    const later = (await listed()).remainingSeconds;
    assert.ok(later >= 250 && later <= 252, `follows the server deadline, got ${later}`);

    await db.query('UPDATE quiz_attempts SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE id = ?', [attemptId]);
    const expired = await listed();
    assert.equal(expired.expired, true);
    assert.equal(expired.remainingSeconds, 0, 'never negative');

    const reopened = await api('POST', `/quizzes/${timedQuiz}/attempts/start`, { token: A.token });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.json));
    assert.equal(reopened.json.data.timedOut, true);
    assert.equal(await listed(), undefined, 'submitted, so no longer in the resume list');
  });

  await t.test('the dashboard lists weak topics', async () => {
    const { topicId } = await makeCourse(A.id);
    const topicQuiz = await makeQuiz(A.id, 'topic', topicId);
    await addAttempt(A.id, topicQuiz, { score: 1 });

    const res = await api('GET', '/dashboard/summary', { token: A.token });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const weak = res.json.data.weakTopics;
    assert.ok(Array.isArray(weak) && weak.length <= 3);
    const row = weak.find((w) => w.topicId === topicId);
    assert.ok(row, JSON.stringify(weak));
    assert.equal(row.topic, `${TAG} Fluid balance`);
    assert.equal(row.avgPercent, 25);
  });
});
