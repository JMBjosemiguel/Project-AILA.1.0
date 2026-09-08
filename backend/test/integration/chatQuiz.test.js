'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.chatquiz.${Date.now()}`;

// A `quiz`-type bot message, exactly as aiService stores one (JSON in message_text).
async function makeChatQuizMessage(userId, topic) {
  const conv = await db.query(
    'INSERT INTO chat_conversations (user_id, title) VALUES (?, ?)',
    [userId, `${TAG} conversation`]
  );
  await db.query(
    "INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'user', 'text', 'make me a quiz')",
    [conv.insertId]
  );
  const quizJson = JSON.stringify({
    topic,
    quizType: 'multiple_choice',
    items: [
      { question: 'Capital of France?', options: ['Paris', 'Berlin'], correctAnswer: 'Paris', explanation: 'Since 987.' },
      { question: '2 + 2 = ?', options: ['3', '4'], correctAnswer: '4', explanation: 'Arithmetic.' },
    ],
  });
  const botMsg = await db.query(
    "INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'bot', 'quiz', ?)",
    [conv.insertId, quizJson]
  );
  return { conversationId: conv.insertId, messageId: botMsg.insertId };
}

test('save chatbot mini-quiz as a persisted practice quiz', async (t) => {
  if (!(await serverReachable())) { t.skip('local backend not reachable'); return; }

  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');
  t.after(async () => { await purgeByTag(TAG); await db.pool.end(); });

  const { messageId } = await makeChatQuizMessage(A.id, `${TAG} geography`);

  let savedQuizId;

  await t.test('owner saves it — 201, practice kind, provenance recorded, TAKE payload has no answer key', async () => {
    const res = await api('POST', `/quizzes/from-chat-message/${messageId}`, { token: A.token });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.alreadySaved, false);
    savedQuizId = res.json.data.quizId;
    assert.ok(savedQuizId);

    const body = JSON.stringify(res.json.data.quiz);
    assert.doesNotMatch(body, /correct_?answer|correctAnswer/i);
    assert.doesNotMatch(body, /explanation/i);
    assert.doesNotMatch(body, /Since 987|Arithmetic/i);
    assert.equal(res.json.data.quiz.items.length, 2);

    const row = await db.query('SELECT assessment_kind, source_type, source_chat_message_id FROM quizzes WHERE id = ?', [savedQuizId]);
    assert.equal(row[0].assessment_kind, 'practice');
    assert.equal(row[0].source_type, 'chat');
    assert.equal(Number(row[0].source_chat_message_id), messageId);
  });

  await t.test('saving the same message again is idempotent — 200, same quiz id, no duplicate row', async () => {
    const res = await api('POST', `/quizzes/from-chat-message/${messageId}`, { token: A.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.alreadySaved, true);
    assert.equal(res.json.data.quizId, savedQuizId);

    const count = await db.query('SELECT COUNT(*) c FROM quizzes WHERE source_chat_message_id = ?', [messageId]);
    assert.equal(Number(count[0].c), 1);
  });

  await t.test('two concurrent saves still create exactly one quiz', async () => {
    const { messageId: raceMsg } = await makeChatQuizMessage(A.id, `${TAG} race`);
    const [r1, r2] = await Promise.all([
      api('POST', `/quizzes/from-chat-message/${raceMsg}`, { token: A.token }),
      api('POST', `/quizzes/from-chat-message/${raceMsg}`, { token: A.token }),
    ]);
    assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 201));
    assert.equal(r1.json.data.quizId, r2.json.data.quizId);
    const count = await db.query('SELECT COUNT(*) c FROM quizzes WHERE source_chat_message_id = ?', [raceMsg]);
    assert.equal(Number(count[0].c), 1);
  });

  await t.test('another student cannot save someone else\'s chat quiz (404, opaque)', async () => {
    const res = await api('POST', `/quizzes/from-chat-message/${messageId}`, { token: B.token });
    assert.equal(res.status, 404);
    const leaked = await db.query('SELECT COUNT(*) c FROM quizzes WHERE user_id = ? AND source_chat_message_id = ?', [B.id, messageId]);
    assert.equal(Number(leaked[0].c), 0);
  });

  await t.test('a non-quiz message id 404s', async () => {
    const conv = await db.query('INSERT INTO chat_conversations (user_id, title) VALUES (?, ?)', [A.id, `${TAG} text conv`]);
    const textMsg = await db.query(
      "INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'bot', 'text', 'just a reply')",
      [conv.insertId]
    );
    assert.equal((await api('POST', `/quizzes/from-chat-message/${textMsg.insertId}`, { token: A.token })).status, 404);
  });

  await t.test('the saved quiz runs the normal resumable attempt lifecycle', async () => {
    const start = await api('POST', `/quizzes/${savedQuizId}/attempts/start`, { token: A.token });
    assert.equal(start.status, 200);
    const attemptId = start.json.data.attempt.id;
    const qIds = start.json.data.items.map((i) => i.id);

    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: A.token, body: { questionId: qIds[0], selectedAnswer: 'Paris' } });
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: A.token, body: { questionId: qIds[1], selectedAnswer: '3' } });
    const submit = await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: A.token });
    assert.equal(submit.status, 200);
    assert.equal(submit.json.data.score, 1);
    assert.equal(submit.json.data.total, 2);
    assert.equal(submit.json.data.items[1].correctAnswer, '4');
  });
});
