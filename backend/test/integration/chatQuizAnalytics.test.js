'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const quizModel = require('../../src/models/quizModel');
const analyticsModel = require('../../src/models/analyticsModel');
const studentContext = require('../../src/services/studentContextService');

const TAG = `qa.itest.chatanalytics.${Date.now()}`;

// Mirrors chatQuiz.test.js's fixture: a `quiz`-type bot message exactly as
// aiService stores one (JSON in message_text).
async function makeChatQuizMessage(userId, topic) {
  const conv = await db.query('INSERT INTO chat_conversations (user_id, title) VALUES (?, ?)', [userId, `${TAG} conversation`]);
  await db.query(
    "INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'user', 'text', 'make me a quiz')",
    [conv.insertId]
  );
  const quizJson = JSON.stringify({
    topic,
    quizType: 'multiple_choice',
    items: [
      { question: 'Capital of France?', options: ['Paris', 'Berlin', 'Rome', 'Madrid'], correctAnswer: 'Paris', explanation: 'Since 987.' },
    ],
  });
  const botMsg = await db.query(
    "INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'bot', 'quiz', ?)",
    [conv.insertId, quizJson]
  );
  return { conversationId: conv.insertId, messageId: botMsg.insertId };
}

// A plain manual practice quiz (no source_type) — one of the "other quiz
// sources" that must keep counting toward analytics exactly as before.
async function makeManualQuiz(userId, topic) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)",
    [userId, topic]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Capital of France?', ?, 'Paris', 'x', 0)",
    [q.insertId, JSON.stringify(['Paris', 'Berlin', 'Rome', 'Madrid'])]
  );
  return q.insertId;
}

async function takeAndSubmit(token, quizId, selectedAnswer) {
  const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token });
  if (start.status !== 200) throw new Error(`start failed: ${start.status} ${JSON.stringify(start.json)}`);
  const attemptId = start.json.data.attempt.id;
  const questionId = start.json.data.items[0].id;
  await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token, body: { questionId, selectedAnswer } });
  const submit = await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token });
  if (submit.status !== 200) throw new Error(`submit failed: ${submit.status} ${JSON.stringify(submit.json)}`);
  return submit;
}

test('AI chat quizzes are separate from learning analytics', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  const { messageId } = await makeChatQuizMessage(A.id, `${TAG} chat topic`);
  const saveRes = await api('POST', `/quizzes/from-chat-message/${messageId}`, { token: A.token });
  assert.equal(saveRes.status, 201);
  const chatQuizId = saveRes.json.data.quizId;

  const manualQuizId = await makeManualQuiz(A.id, `${TAG} manual topic`);

  await takeAndSubmit(A.token, chatQuizId, 'Paris'); // correct, scores 1/1
  await takeAndSubmit(A.token, manualQuizId, 'Paris'); // correct, scores 1/1

  await t.test('Dashboard quiz average, recent quizzes, and the quiz trend reflect ONLY the manual quiz', async () => {
    const avg = await quizModel.getQuizAverageScore(A.id);
    assert.equal(Number(avg.attempt_count), 1, 'only the manual quiz attempt counts toward the average');

    const recent = await quizModel.listAttemptsForUser(A.id, 10);
    assert.ok(recent.some((r) => r.quiz_id === manualQuizId), 'manual quiz appears in recent quizzes');
    assert.ok(!recent.some((r) => r.quiz_id === chatQuizId), 'chat quiz is excluded from recent quizzes');

    const trend = await analyticsModel.getQuizPerformanceTrend(A.id);
    const today = trend[trend.length - 1];
    assert.equal(Number(today.avg_percent), 100, 'trend reflects only the manual quiz (100%), not blended with the chat quiz');
  });

  await t.test('personalization\'s getRecentQuizAverage excludes the chat quiz too', async () => {
    const recentAvg = await studentContext.getRecentQuizAverage(A.id);
    assert.equal(recentAvg.attemptCount, 1, 'only the manual quiz attempt counts');
    assert.equal(recentAvg.average, 100);
  });

  await t.test('XP was awarded for BOTH quizzes, unchanged from before', async () => {
    const rows = await db.query(
      "SELECT event_key, points FROM xp_events WHERE user_id = ? AND event_key IN (?, ?)",
      [A.id, `quiz_completed:${chatQuizId}`, `quiz_completed:${manualQuizId}`]
    );
    assert.equal(rows.length, 2, 'both the chat quiz and the manual quiz awarded XP exactly once');
    for (const row of rows) assert.ok(Number(row.points) > 0);
  });

  await t.test('GET /quizzes/chat lists only the owner\'s saved chat quizzes', async () => {
    const listA = await api('GET', '/quizzes/chat', { token: A.token });
    assert.equal(listA.status, 200);
    assert.ok(listA.json.data.quizzes.some((q) => q.id === chatQuizId));
    assert.ok(!listA.json.data.quizzes.some((q) => q.id === manualQuizId), 'the manual quiz never shows up as a chat quiz');

    const listB = await api('GET', '/quizzes/chat', { token: B.token });
    assert.equal(listB.status, 200);
    assert.equal(listB.json.data.quizzes.length, 0);
  });

  await t.test('another student cannot take someone else\'s saved chat quiz (404)', async () => {
    const res = await api('POST', `/quizzes/${chatQuizId}/attempts/start`, { token: B.token });
    assert.equal(res.status, 404);
  });

  await t.test('the Learning Hub search never returns a chat quiz', async () => {
    const res = await api('GET', `/quizzes/search?search=${encodeURIComponent(TAG)}`, { token: A.token });
    assert.equal(res.status, 200);
    assert.ok(!res.json.data.quizzes.some((q) => q.id === chatQuizId), 'chat quiz excluded from Learning Hub search');
    assert.ok(res.json.data.quizzes.some((q) => q.id === manualQuizId), 'manual quiz still findable in Learning Hub search');
  });
});
