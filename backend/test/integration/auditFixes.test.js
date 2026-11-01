'use strict';
/*
 * Audit fixes: checkpoint/final answers withheld until passed, owner-scoped
 * quiz sources, no leaderboard API while gamification is hidden, lesson opens
 * that only count against the AI limit when they generate, and the legacy
 * one-shot submit after a timeout.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');
const learningModel = require('../../src/models/learningModel');
const quizModel = require('../../src/models/quizModel');

const TAG = `qa.itest.auditfix.${Date.now()}`;
const subjectIds = [];

async function makeCourse(userId, { lessonContent = 'x' } = {}) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course`]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module 1']);
  const tp = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, `${TAG} topic`]);
  const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, ?, 'medium')", [tp.insertId, 'Lesson 1', lessonContent]);
  return { subjectId: s.insertId, moduleId: m.insertId, topicId: tp.insertId, lessonId: l.insertId };
}

// modules -> subjects has no ON DELETE CASCADE, so courses go before purgeByTag.
async function wipeCourse(subjectId) {
  const tail = 'JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id ${tail}`, [subjectId]).catch(() => {});
  await db.query(`DELETE l FROM lessons l ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE lp FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE qa FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id WHERE q.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM quizzes WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

// Two questions, both answered by 'a'. kind: 'practice' or 'module_checkpoint'.
async function makeQuiz(userId, { kind = 'practice', course = null } = {}) {
  const formal = kind !== 'practice';
  const q = await db.query(
    `INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, item_count, subject_id, module_id, assessment_kind, passing_score, assessment_slot)
     VALUES (?, ?, 'multiple_choice', 'medium', ?, 2, ?, ?, ?, ?, ?)`,
    [userId, `${TAG} ${kind}`, formal ? null : 'lesson', formal ? course.subjectId : null, formal ? course.moduleId : null,
      kind, formal ? 60 : null, formal ? course.moduleId : null]
  );
  const questionIds = [];
  for (let i = 0; i < 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await db.query(
      "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, ?, ?, 'a', ?, ?)",
      [q.insertId, `Question ${i + 1}?`, JSON.stringify(['a', 'b']), `Because a (${i + 1}).`, i]
    );
    questionIds.push(r.insertId);
  }
  return { quizId: q.insertId, questionIds };
}

test('audit fixes', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health');
    return;
  }

  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    await db.query('DELETE qa FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id WHERE q.topic LIKE ?', [`${TAG}%`]).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  const start = (quizId, token = A.token, body = { timeLimitMinutes: null }) => api('POST', `/quizzes/${quizId}/attempts/start`, { token, body });
  const submit = (attemptId, token = A.token) => api('POST', `/quizzes/attempts/${attemptId}/submit`, { token });
  const answer = (attemptId, questionId, selectedAnswer, token = A.token) => (
    api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token, body: { questionId, selectedAnswer } })
  );

  await t.test('a checkpoint that was not passed shows only right/wrong; passing shows answers and rationale', async () => {
    const course = await makeCourse(A.id);
    const { quizId, questionIds } = await makeQuiz(A.id, { kind: 'module_checkpoint', course });

    const failed = await start(quizId);
    assert.equal(failed.status, 200, JSON.stringify(failed.json));
    const failedId = failed.json.data.attempt.id;
    await answer(failedId, questionIds[0], 'b');
    const failedReview = await submit(failedId);
    assert.equal(failedReview.status, 200, JSON.stringify(failedReview.json));
    const f = failedReview.json.data;
    assert.equal(f.passed, false);
    assert.equal(f.answersHidden, true);
    assert.equal(f.score, 0);
    assert.deepEqual(f.items.map((i) => i.isCorrect), [false, false]);
    assert.deepEqual(f.items.map((i) => [i.correctAnswer, i.explanation]), [[null, null], [null, null]]);
    assert.ok(!/Because a/.test(JSON.stringify(f)), 'no rationale text anywhere in the response');

    // Reading the same attempt later (history, activity "View") is also withheld.
    const again = await api('GET', `/quizzes/attempts/${failedId}`, { token: A.token });
    assert.equal(again.status, 200);
    assert.equal(again.json.data.answersHidden, true);
    assert.deepEqual(again.json.data.items.map((i) => i.correctAnswer), [null, null]);

    // The retake is the same questions; passing it shows everything.
    const retake = await start(quizId);
    const retakeId = retake.json.data.attempt.id;
    assert.notEqual(retakeId, failedId);
    await answer(retakeId, questionIds[0], 'a');
    await answer(retakeId, questionIds[1], 'a');
    const passedReview = await submit(retakeId);
    const p = passedReview.json.data;
    assert.equal(p.passed, true);
    assert.equal(p.answersHidden, undefined);
    assert.deepEqual(p.items.map((i) => i.correctAnswer), ['a', 'a']);
    assert.deepEqual(p.items.map((i) => i.explanation), ['Because a (1).', 'Because a (2).']);

    const passedAgain = await api('GET', `/quizzes/attempts/${retakeId}`, { token: A.token });
    assert.deepEqual(passedAgain.json.data.items.map((i) => i.correctAnswer), ['a', 'a']);
  });

  await t.test('a practice quiz keeps the full review even when failed', async () => {
    const { quizId } = await makeQuiz(A.id);
    const started = await start(quizId);
    const review = await submit(started.json.data.attempt.id);
    assert.equal(review.status, 200, JSON.stringify(review.json));
    assert.equal(review.json.data.answersHidden, undefined);
    assert.deepEqual(review.json.data.items.map((i) => i.correctAnswer), ['a', 'a']);
    assert.ok(review.json.data.items.every((i) => i.explanation));
  });

  await t.test('quiz generation from a lesson or topic needs the student to own it (404 otherwise)', async () => {
    const course = await makeCourse(A.id);
    for (const [sourceType, sourceId] of [['lesson', course.lessonId], ['topic', course.topicId]]) {
      const single = await api('POST', '/quizzes/generate', { token: B.token, body: { topic: 'Anything', sourceType, sourceId } });
      assert.equal(single.status, 404, `generate ${sourceType}: ${JSON.stringify(single.json)}`);
      const batch = await api('POST', '/quizzes/generate/batch-start', { token: B.token, body: { topic: 'Anything', itemCount: 30, sourceType, sourceId } });
      assert.equal(batch.status, 404, `batch ${sourceType}: ${JSON.stringify(batch.json)}`);
    }
    const none = await db.query('SELECT COUNT(*) AS c FROM quizzes WHERE user_id = ?', [B.id]);
    assert.equal(Number(none[0].c), 0, 'nothing was created for the other student');

    // The model scopes by owner: the owner gets the context, anyone else gets nothing.
    const mine = await quizModel.getQuizSourceContext('lesson', course.lessonId, A.id);
    assert.equal(mine.lessonTitle, 'Lesson 1');
    assert.equal(await quizModel.getQuizSourceContext('lesson', course.lessonId, B.id), null);
    assert.equal(await quizModel.getQuizSourceContext('topic', course.topicId, B.id), null);
    assert.ok(await quizModel.getQuizSourceContext('topic', course.topicId, A.id));
  });

  await t.test('the leaderboard API is a 404 while gamification is hidden (the default)', async () => {
    const res = await api('GET', '/gamification/leaderboard?period=weekly', { token: A.token });
    assert.equal(res.status, 404, JSON.stringify(res.json));
    assert.ok(!/xp|level/i.test(JSON.stringify(res.json.data ?? {})));
  });

  await t.test('opening a lesson that already has content never counts against the AI limit', async () => {
    const course = await makeCourse(A.id, { lessonContent: 'Ready-made lesson content.' });
    // The AI limit is 30 per 5 minutes; 34 opens would trip it if they counted.
    for (let i = 0; i < 34; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('GET', `/lessons/${course.lessonId}`, { token: A.token });
      assert.equal(res.status, 200, `open #${i + 1}: ${JSON.stringify(res.json)}`);
    }
  });

  await t.test('lessonNeedsGeneration: only the owner, and only for a lesson without content', async () => {
    const withContent = await makeCourse(A.id, { lessonContent: 'Has content' });
    const empty = await makeCourse(A.id, { lessonContent: '' });
    await db.query('UPDATE lessons SET content = NULL WHERE id = ?', [empty.lessonId]);

    assert.equal(await learningModel.lessonNeedsGeneration(withContent.lessonId, A.id), false);
    assert.equal(await learningModel.lessonNeedsGeneration(empty.lessonId, A.id), true);
    assert.equal(await learningModel.lessonNeedsGeneration(empty.lessonId, B.id), false, 'not the owner: the route answers 404');
    assert.equal(await learningModel.lessonNeedsGeneration(99999999, A.id), false);
  });

  await t.test('the legacy one-shot submit after the attempt timed out returns its review, not a 500', async () => {
    const { quizId, questionIds } = await makeQuiz(A.id);
    const started = await start(quizId, A.token, { timeLimitMinutes: 5 });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const attemptId = started.json.data.attempt.id;
    await answer(attemptId, questionIds[0], 'a');
    await db.query('UPDATE quiz_attempts SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE id = ?', [attemptId]);

    const legacy = await api('POST', `/quizzes/${quizId}/attempts`, {
      token: A.token, body: { answers: [{ questionId: questionIds[0], selectedAnswer: 'a' }] },
    });
    assert.equal(legacy.status, 201, JSON.stringify(legacy.json));
    assert.equal(legacy.json.data.timedOut, true);
    assert.equal(legacy.json.data.score, 1, 'graded from what was saved before the deadline');
    assert.equal(legacy.json.data.attemptId, attemptId);
  });
});
