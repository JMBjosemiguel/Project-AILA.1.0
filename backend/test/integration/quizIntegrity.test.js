'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.quiz.${Date.now()}`;

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

test('quiz assessment integrity (take vs review)', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const student = await createStudent(TAG, 'a');
  const other = await createStudent(TAG, 'b');
  const { quizId, questionIds } = await makeQuiz(student.id, `${TAG} geography`);

  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  await t.test('GET /quizzes/:id returns a take payload with NO answer key', async () => {
    const res = await api('GET', `/quizzes/${quizId}`, { token: student.token });
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.json);
    assert.doesNotMatch(body, /correct_?answer|correctAnswer/i);
    assert.doesNotMatch(body, /explanation/i);
    assert.doesNotMatch(body, /is_?correct|isCorrect/i);
    // explanation text must not leak (question options like "Paris" are expected)
    assert.doesNotMatch(body, /987|Basic arithmetic/i);
    assert.equal(res.json.data.items.length, 2);
    assert.ok(res.json.data.items[0].question && Array.isArray(res.json.data.items[0].options));
  });

  await t.test('another student cannot read the quiz', async () => {
    assert.equal((await api('GET', `/quizzes/${quizId}`, { token: other.token })).status, 404);
  });

  await t.test('submitting returns a review payload with correct answers + explanations', async () => {
    const res = await api('POST', `/quizzes/${quizId}/attempts`, {
      token: student.token,
      body: { answers: [
        { questionId: questionIds[0], selectedAnswer: 'Paris' },
        { questionId: questionIds[1], selectedAnswer: '5' },
      ] },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.score, 1);
    assert.equal(res.json.data.total, 2);
    const items = res.json.data.items;
    assert.equal(items[0].isCorrect, true);
    assert.equal(items[0].correctAnswer, 'Paris');
    assert.equal(items[1].isCorrect, false);
    assert.equal(items[1].correctAnswer, '4');
    assert.match(items[1].explanation, /arithmetic/i);
    assert.equal(items[1].yourAnswer, '5');
  });

  await t.test('grading ignores client-supplied correctAnswer / isCorrect / score', async () => {
    const res = await api('POST', `/quizzes/${quizId}/attempts`, {
      token: student.token,
      body: {
        score: 999,
        answers: [
          // claim a wrong answer is right
          { questionId: questionIds[0], selectedAnswer: 'Berlin', correctAnswer: 'Berlin', isCorrect: true },
          { questionId: questionIds[1], selectedAnswer: '4', correctAnswer: '4', isCorrect: true },
        ],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.score, 1, 'server re-grades: only "4" is actually correct');
    assert.equal(res.json.data.items[0].isCorrect, false);
    assert.equal(res.json.data.items[0].correctAnswer, 'Paris');
  });

  await t.test('another student cannot submit an attempt for the quiz', async () => {
    const res = await api('POST', `/quizzes/${quizId}/attempts`, {
      token: other.token,
      body: { answers: [{ questionId: questionIds[0], selectedAnswer: 'Paris' }] },
    });
    assert.equal(res.status, 404);
  });

  await t.test('GET /quizzes/attempts/:id returns the graded review for the owner only', async () => {
    const attempts = await db.query('SELECT id FROM quiz_attempts WHERE quiz_id = ? ORDER BY id LIMIT 1', [quizId]);
    const attemptId = attempts[0].id;
    const mine = await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token });
    assert.equal(mine.status, 200);
    assert.ok(mine.json.data.items[0].correctAnswer);
    assert.ok('explanation' in mine.json.data.items[0]);
    assert.equal((await api('GET', `/quizzes/attempts/${attemptId}`, { token: other.token })).status, 404);
  });
});
