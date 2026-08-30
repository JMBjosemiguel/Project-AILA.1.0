'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const TAG = `qa.itest.own.${Date.now()}`;

test('cross-student data isolation', async (t) => {
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

  await t.test('planner tasks are private to their owner', async () => {
    const created = await api('POST', '/study-tasks', { token: A.token, body: { title: `${TAG} task`, priority_id: 2 } });
    assert.equal(created.status, 201);
    const taskId = created.json.data.id;

    const bList = await api('GET', '/study-tasks', { token: B.token });
    assert.ok(!bList.json.data.tasks.some((x) => x.id === taskId));
    assert.equal((await api('PATCH', `/study-tasks/${taskId}`, { token: B.token, body: { title: 'hijack' } })).status, 404);
    assert.equal((await api('POST', `/study-tasks/${taskId}/duplicate`, { token: B.token })).status, 404);
    assert.equal((await api('DELETE', `/study-tasks/${taskId}`, { token: B.token })).status, 404);

    const [row] = await db.query('SELECT title, deleted_at FROM study_tasks WHERE id = ?', [taskId]);
    assert.equal(row.title, `${TAG} task`);
    assert.equal(row.deleted_at, null);
  });

  await t.test('quizzes and attempts are private to their owner', async () => {
    const q = await db.query("INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)", [A.id, `${TAG} quiz`]);
    const quizId = q.insertId;
    await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q', ?, 'A', 'x', 0)", [quizId, JSON.stringify(['A', 'B'])]);
    const at = await db.query('INSERT INTO quiz_attempts (quiz_id, user_id, score, total, completed_at) VALUES (?, ?, 1, 1, CURRENT_TIMESTAMP)', [quizId, A.id]);
    const attemptId = at.insertId;

    assert.equal((await api('GET', `/quizzes/${quizId}`, { token: B.token })).status, 404);
    assert.equal((await api('GET', `/quizzes/attempts/${attemptId}`, { token: B.token })).status, 404);
    assert.equal((await api('DELETE', `/quizzes/attempts/${attemptId}`, { token: B.token })).status, 404);
    assert.equal((await api('POST', `/quizzes/${quizId}/attempts`, { token: B.token, body: { answers: [{ questionId: 1, selectedAnswer: 'A' }] } })).status, 404);
    assert.equal((await api('GET', `/quizzes/${quizId}`, { token: A.token })).status, 200);
  });

  await t.test('chat conversations are private to their owner', async () => {
    const c = await db.query('INSERT INTO chat_conversations (user_id, title) VALUES (?, ?)', [A.id, `${TAG} convo`]);
    const convId = c.insertId;
    await db.query("INSERT INTO chat_messages (conversation_id, sender, message_type, message_text) VALUES (?, 'user', 'text', 'A private message')", [convId]);

    assert.equal((await api('GET', `/chat/${convId}`, { token: B.token })).status, 404);
    assert.equal((await api('PATCH', `/chat/${convId}`, { token: B.token, body: { title: 'hijack' } })).status, 404);
    assert.equal((await api('DELETE', `/chat/${convId}`, { token: B.token })).status, 404);
    const bHist = await api('GET', '/chat/history', { token: B.token });
    assert.ok(!JSON.stringify(bHist.json).includes(`${TAG} convo`));
  });

  await t.test('resources are private to their owner (and admin uploads)', async () => {
    const r = await db.query("INSERT INTO resources (uploaded_by, title, type, external_url) VALUES (?, ?, 'link', 'https://example.com')", [A.id, `${TAG} resource`]);
    const resId = r.insertId;

    const bList = await api('GET', '/resources', { token: B.token });
    assert.ok(!JSON.stringify(bList.json).includes(`${TAG} resource`));
    assert.equal((await api('POST', `/resources/${resId}/view`, { token: B.token })).status, 404);
    assert.equal((await api('GET', `/resources/${resId}/download`, { token: B.token })).status, 404);
    assert.equal((await api('PATCH', `/resources/${resId}`, { token: B.token, body: { title: 'hijack' } })).status, 404);
    assert.equal((await api('DELETE', `/resources/${resId}`, { token: B.token })).status, 404);
  });

  await t.test('notifications are private to their recipient', async () => {
    const n = await db.query("INSERT INTO notifications (type, title, body) VALUES ('system', ?, 'b')", [`${TAG} notif`]);
    const notifId = n.insertId;
    await db.query('INSERT INTO notification_recipients (notification_id, user_id) VALUES (?, ?)', [notifId, A.id]);

    const bList = await api('GET', '/notifications', { token: B.token });
    assert.ok(!JSON.stringify(bList.json).includes(`${TAG} notif`));
    assert.equal((await api('PATCH', `/notifications/${notifId}/read`, { token: B.token })).status, 404);
    assert.equal((await api('DELETE', `/notifications/${notifId}`, { token: B.token })).status, 404);
    const [row] = await db.query('SELECT is_read FROM notification_recipients WHERE notification_id = ? AND user_id = ?', [notifId, A.id]);
    assert.equal(row.is_read, 0);
  });

  await t.test('unauthenticated and tampered tokens are rejected', async () => {
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/auth/me', { token: 'not.a.jwt' })).status, 401);
  });
});
