'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');
const { generateVerificationToken } = require('../../src/utils/verificationToken');

const TAG = `qa.itest.audit.${Date.now()}`;

// 1x1 png — same fixture used by resourceUpload.test.js.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function uploadPng(token, name) {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${BASE_URL}/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function makeQuiz(userId, topic) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 1)",
    [userId, topic]
  );
  const quizId = q.insertId;
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q', ?, 'A', 'x', 0)",
    [quizId, JSON.stringify(['A', 'B'])]
  );
  const [{ id: questionId }] = await db.query('SELECT id FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  return { quizId, questionId };
}

async function latestAuditRow(actorId, action) {
  const rows = await db.query(
    'SELECT * FROM admin_audit_log WHERE admin_id = ? AND action = ? ORDER BY id DESC LIMIT 1',
    [actorId, action]
  );
  return rows[0] || null;
}

async function countAuditRows(actorId, action) {
  const rows = await db.query('SELECT COUNT(*) AS c FROM admin_audit_log WHERE admin_id = ? AND action = ?', [actorId, action]);
  return Number(rows[0].c);
}

test('student actions appear in the audit log', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const student = await createStudent(TAG, 'a'); // already exercises register + login
  const adminToken = await loginAdmin();

  t.after(async () => {
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('registration and login are logged against the student themselves', async () => {
    const registerRow = await latestAuditRow(student.id, 'user.register');
    assert.ok(registerRow, 'expected a user.register row');
    assert.equal(registerRow.target_table, 'users');
    assert.equal(registerRow.target_id, student.id);

    const loginRow = await latestAuditRow(student.id, 'user.login');
    assert.ok(loginRow, 'expected a user.login row');
    assert.equal(loginRow.target_table, 'users');
    assert.equal(loginRow.target_id, student.id);
  });

  await t.test('logout is logged', async () => {
    // A dedicated student — logging out invalidates the session, and the
    // shared `student` fixture's token is still needed by later tests below.
    const loggingOut = await createStudent(TAG, 'logout');
    const res = await api('POST', '/auth/logout', { token: loggingOut.token });
    assert.equal(res.status, 200);
    assert.ok(await latestAuditRow(loggingOut.id, 'user.logout'), 'expected a user.logout row');
  });

  await t.test('email verification is logged once, never on a repeat click', async () => {
    const email = `${TAG}.verify@example.com`;
    const reg = await api('POST', '/auth/register', {
      body: {
        first_name: 'ITest',
        last_name: 'Verify',
        email,
        password: 'ItestPassw0rd!',
        student_number: `IT-VF-${Date.now()}`.slice(0, 30),
      },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.json));
    const userId = reg.json.data.user.id;

    const { raw, hash } = generateVerificationToken();
    await db.query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, used_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NULL)',
      [userId, hash]
    );

    const verify = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(verify.status, 200, JSON.stringify(verify.json));
    assert.equal(await countAuditRows(userId, 'user.verify_email'), 1);

    // Re-clicking the same (now-consumed) link resolves "already verified" —
    // a no-op, not a second logged event.
    const repeat = await api('POST', '/auth/verify-email', { body: { token: raw } });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.json.data.alreadyVerified, true);
    assert.equal(await countAuditRows(userId, 'user.verify_email'), 1, 'a repeat click does not log again');
  });

  await t.test('resource upload is logged', async () => {
    const r = await uploadPng(student.token, `${TAG} upload.png`);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const row = await latestAuditRow(student.id, 'resource.upload');
    assert.ok(row, 'expected a resource.upload row');
    assert.equal(row.target_table, 'resources');
    assert.equal(row.target_id, r.json.data.id);
  });

  await t.test('quiz submission is logged, with no sensitive data in details', async () => {
    const { quizId, questionId } = await makeQuiz(student.id, `${TAG} submit`);
    const start = await api('POST', `/quizzes/${quizId}/attempts/start`, { token: student.token });
    const attemptId = start.json.data.attempt.id;
    await api('PATCH', `/quizzes/attempts/${attemptId}/answers`, { token: student.token, body: { questionId, selectedAnswer: 'A' } });
    const submitted = await api('POST', `/quizzes/attempts/${attemptId}/submit`, { token: student.token });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json));

    const row = await latestAuditRow(student.id, 'quiz.submit');
    assert.ok(row, 'expected a quiz.submit row');
    assert.equal(row.target_table, 'quiz_attempts');
    assert.equal(row.target_id, attemptId);

    const details = JSON.parse(row.details);
    assert.equal(details.quizId, quizId);
    assert.ok(!/password|token|authorization/i.test(JSON.stringify(details)), 'details never contain credentials');
  });

  await t.test('the audit log endpoint can filter by role without mixing them', async () => {
    const studentOnly = await api('GET', '/admin/audit-log?role=student', { token: adminToken });
    assert.equal(studentOnly.status, 200);
    assert.ok(studentOnly.json.data.entries.length > 0);
    assert.ok(studentOnly.json.data.entries.every((e) => e.role === 'student'));

    const adminOnly = await api('GET', '/admin/audit-log?role=admin', { token: adminToken });
    assert.equal(adminOnly.status, 200);
    assert.ok(adminOnly.json.data.entries.every((e) => e.role === 'admin'));
  });

  await t.test('students cannot read the audit log themselves', async () => {
    assert.equal((await api('GET', '/admin/audit-log', { token: student.token })).status, 403);
  });
});
