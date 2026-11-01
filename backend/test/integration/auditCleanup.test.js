'use strict';
/*
 * Audit cleanup: shares of deleted/deactivated owners, reset progress,
 * consistent quiz averages, the regroup audit entry, the removed /api/users/*
 * placeholders, avatar_url and chat message limits.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');
const shareService = require('../../src/services/materialShareService');
const adminService = require('../../src/services/adminService');
const adminModel = require('../../src/models/adminModel');
const topicGroupingService = require('../../src/services/topicGroupingService');
const adminController = require('../../src/controllers/adminController');
const { appDateStr } = require('../../src/utils/appTime');

const TAG = `qa.itest.cleanup.${Date.now()}`;
const subjectIds = [];
const auditIds = [];

async function makeCourse(userId) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course`]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module 1']);
  const tp = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, `${TAG} topic`]);
  const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, 'x', 'medium')", [tp.insertId, 'Lesson 1']);
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

async function makeQuiz(userId, { topic, sourceType = null, sourceId = null, kind = 'practice', subjectId = null, moduleId = null }) {
  const q = await db.query(
    `INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, source_id, item_count, subject_id, module_id, assessment_kind, passing_score, assessment_slot)
     VALUES (?, ?, 'multiple_choice', 'medium', ?, ?, 10, ?, ?, ?, ?, ?)`,
    [userId, `${TAG} ${topic}`, sourceType, sourceId, subjectId, moduleId, kind, kind === 'practice' ? null : 60, kind === 'practice' ? null : moduleId]
  );
  return q.insertId;
}

const addAttempts = async (userId, quizId, scores, total = 10) => {
  for (const score of scores) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      "INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, ?, 'submitted', NOW())",
      [quizId, userId, score, total]
    );
  }
};

test('audit cleanup', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health');
    return;
  }

  const adminToken = await loginAdmin();
  const adminId = (await api('GET', '/auth/me', { token: adminToken })).json.data.user.id;
  const A = await createStudent(TAG, 'a');
  const B = await createStudent(TAG, 'b');
  const C = await createStudent(TAG, 'c');
  const deletedEmails = new Map();

  t.after(async () => {
    // A deleted account has a tombstone email; give it back its tagged email so purgeByTag finds it.
    for (const [id, email] of deletedEmails) {
      await db.query('UPDATE users SET email = ?, deleted_at = NULL WHERE id = ?', [email, id]).catch(() => {});
    }
    for (const id of subjectIds) await wipeCourse(id);
    await db.query('DELETE qa FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id WHERE q.topic LIKE ?', [`${TAG}%`]).catch(() => {});
    await db.query('DELETE FROM material_shares WHERE created_by IN (?, ?, ?)', [A.id, B.id, C.id]).catch(() => {});
    if (auditIds.length) await db.query(`DELETE FROM admin_audit_log WHERE id IN (${auditIds.map(() => '?').join(',')})`, auditIds).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  const view = (token) => api('GET', `/share/${token}`);

  await t.test('share links stop working when the owner is deactivated, and when an admin deletes the owner', async () => {
    // B: a shared quiz, owner deactivated then reactivated.
    const quizB = await makeQuiz(B.id, { topic: 'shared quiz' });
    await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q?', ?, 'a', 'x', 0)", [quizB, JSON.stringify(['a', 'b'])]);
    const shareB = await shareService.createShare(B.id, 'quiz', quizB, 'unlisted');
    assert.equal((await view(shareB.token)).status, 200);

    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [B.id]);
    const whileInactive = await view(shareB.token);
    assert.equal(whileInactive.status, 404);
    assert.match(whileInactive.json.message, /no longer available/);
    assert.equal((await api('POST', `/share/${shareB.token}/check`, { body: { answers: [{ index: 0, answer: 'a' }] } })).status, 404);
    await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [B.id]);
    assert.equal((await view(shareB.token)).status, 200, 'an active owner works again');

    // A: a shared course and a shared quiz, owner deleted by an admin.
    const course = await makeCourse(A.id);
    const courseShare = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    const quizA = await makeQuiz(A.id, { topic: 'a quiz' });
    await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q?', ?, 'a', 'x', 0)", [quizA, JSON.stringify(['a', 'b'])]);
    const quizShare = await shareService.createShare(A.id, 'quiz', quizA, 'unlisted');
    assert.equal((await view(courseShare.token)).status, 200);
    assert.equal((await view(quizShare.token)).status, 200);

    deletedEmails.set(A.id, A.email);
    const del = await api('DELETE', `/admin/users/${A.id}`, { token: adminToken });
    assert.equal(del.status, 200, JSON.stringify(del.json));

    for (const token of [courseShare.token, quizShare.token]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await view(token);
      assert.equal(res.status, 404, 'the link is gone');
      assert.match(res.json.message, /no longer available/);
    }
    const open = await db.query('SELECT COUNT(*) AS c FROM material_shares WHERE created_by = ? AND revoked_at IS NULL', [A.id]);
    assert.equal(Number(open[0].c), 0, 'every active share of the deleted student was revoked');
    assert.equal((await api('POST', `/share/${courseShare.token}/copy`, { token: C.token })).status, 404, 'and cannot be copied either');
  });

  await t.test('reset progress also clears XP events and milestones; a missing or deleted user is a 404 with no audit entry', async () => {
    const auditCount = async () => Number((await db.query("SELECT COUNT(*) AS c FROM admin_audit_log WHERE action = 'user.reset_progress'"))[0].c);

    await db.query("INSERT INTO xp_events (user_id, event_key, points) VALUES (?, 'lesson_completed:cleanup', 40), (?, 'legacy_balance', 60)", [C.id, C.id]);
    await db.query('UPDATE user_profiles SET xp_points = 100, level = 2 WHERE user_id = ?', [C.id]);
    await db.query("INSERT INTO user_achievements (user_id, achievement_id) SELECT ?, id FROM achievements WHERE slug = 'first_lesson'", [C.id]);

    const before = await auditCount();
    const reset = await api('POST', `/admin/users/${C.id}/reset-progress`, { token: adminToken });
    assert.equal(reset.status, 200, JSON.stringify(reset.json));
    assert.equal(await auditCount(), before + 1, 'one audit entry for the reset');

    const xpRows = await db.query('SELECT COUNT(*) AS c FROM xp_events WHERE user_id = ?', [C.id]);
    const achRows = await db.query('SELECT COUNT(*) AS c FROM user_achievements WHERE user_id = ?', [C.id]);
    const [profile] = await db.query('SELECT xp_points, level FROM user_profiles WHERE user_id = ?', [C.id]);
    assert.equal(Number(xpRows[0].c), 0);
    assert.equal(Number(achRows[0].c), 0);
    assert.deepEqual([Number(profile.xp_points), Number(profile.level)], [0, 1]);

    // A user that does not exist, and one that was deleted.
    const afterReset = await auditCount();
    for (const id of [999999999, A.id]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('POST', `/admin/users/${id}/reset-progress`, { token: adminToken });
      assert.equal(res.status, 404, `user ${id}: ${JSON.stringify(res.json)}`);
    }
    assert.equal(await auditCount(), afterReset, 'no audit entry for a 404');
    await assert.rejects(() => adminService.resetUserProgress(adminId, 999999999), (e) => e.statusCode === 404);
  });

  await t.test('quiz averages: chat quizzes are out and checkpoints/finals are in, for "students who may need help" and the course detail', async () => {
    // Needs-help: both students are active today so only the quiz average can flag them.
    const D = await createStudent(TAG, 'd');
    const E = await createStudent(TAG, 'e');
    for (const u of [D, E]) {
      await db.query('INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date) VALUES (?, 1, 1, ?)', [u.id, appDateStr()]);
    }
    const chatQuiz = await makeQuiz(D.id, { topic: 'chat quiz', sourceType: 'chat' });
    await addAttempts(D.id, chatQuiz, [0, 0, 0]); // 0% on chat quizzes only
    const course = await makeCourse(E.id);
    const checkpoint = await makeQuiz(E.id, { topic: 'checkpoint', kind: 'module_checkpoint', subjectId: course.subjectId, moduleId: course.moduleId });
    await addAttempts(E.id, checkpoint, [1, 2, 1]); // 10-20% on a checkpoint

    const { students } = await adminModel.getStudentsNeedingHelp(100000);
    assert.ok(!students.some((s) => s.id === D.id), 'chat-quiz attempts do not make a student look weak');
    const flagged = students.find((s) => s.id === E.id);
    assert.ok(flagged, 'checkpoint attempts count');
    assert.match(flagged.reason, /^Recent quiz average \d+%$/);

    // Course detail: practice quiz on a lesson (40%) + a checkpoint of the course (80%) + a chat quiz (ignored).
    const practice = await makeQuiz(E.id, { topic: 'lesson quiz', sourceType: 'lesson', sourceId: course.lessonId });
    await addAttempts(E.id, practice, [4]);
    await db.query('DELETE FROM quiz_attempts WHERE quiz_id = ?', [checkpoint]);
    await addAttempts(E.id, checkpoint, [8]);
    const ignoredChat = await makeQuiz(E.id, { topic: 'chat for E', sourceType: 'chat' });
    await addAttempts(E.id, ignoredChat, [0]);

    const detail = await adminService.getCourseDetail(course.subjectId);
    assert.equal(Number(detail.avgQuizScore), 60, '(40% + 80%) / 2: the lesson quiz and the checkpoint, no chat quiz');

    // The same rule as the Users table.
    const users = await api('GET', `/admin/users?search=${encodeURIComponent(E.email)}`, { token: adminToken });
    const row = users.json.data.users.find((u) => u.id === E.id);
    assert.equal(Number(row.avg_quiz_score), 60);
  });

  await t.test('the admin topic regroup is written to the audit log', async () => {
    const real = topicGroupingService.getTopicGroups;
    topicGroupingService.getTopicGroups = async () => ({ groups: [] });
    try {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      let failure = null;
      adminController.regroupTopicGroups({ auth: { user: { id: adminId } } }, res, (err) => { failure = err; });
      // The wrapped handler does not return its promise, so wait for the response.
      for (let i = 0; i < 50 && !res.code && !failure; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
      assert.equal(failure, null);
      assert.equal(res.code, 200);
    } finally {
      topicGroupingService.getTopicGroups = real;
    }
    const rows = await db.query("SELECT id, target_table FROM admin_audit_log WHERE admin_id = ? AND action = 'topic_groups.regroup' ORDER BY id DESC LIMIT 1", [adminId]);
    assert.equal(rows.length, 1, 'an audit entry was written');
    auditIds.push(rows[0].id);
    assert.equal(rows[0].target_table, 'topic_groups');
  });

  await t.test('the /api/users/* placeholders are gone (404, not 501), while /users/me still works', async () => {
    for (const path of ['/users', '/users/1']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('GET', path, { token: B.token });
      assert.equal(res.status, 404, `${path}: ${JSON.stringify(res.json)}`);
    }
    assert.equal((await api('POST', '/users', { token: B.token, body: {} })).status, 404);
    assert.equal((await api('GET', '/users/me/profile', { token: B.token })).status, 200);
  });

  await t.test('avatar_url: empty or https only', async () => {
    for (const avatar_url of ['http://example.com/me.png', 'javascript:alert(1)', 'not a url']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api('PATCH', '/users/me/profile', { token: B.token, body: { avatar_url } });
      assert.equal(res.status, 422, `${avatar_url}: ${JSON.stringify(res.json)}`);
    }
    const ok = await api('PATCH', '/users/me/profile', { token: B.token, body: { avatar_url: 'https://example.com/me.png' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal((await db.query('SELECT avatar_url FROM user_profiles WHERE user_id = ?', [B.id]))[0].avatar_url, 'https://example.com/me.png');

    const cleared = await api('PATCH', '/users/me/profile', { token: B.token, body: { avatar_url: '' } });
    assert.equal(cleared.status, 200);
    assert.equal((await db.query('SELECT avatar_url FROM user_profiles WHERE user_id = ?', [B.id]))[0].avatar_url, null);
  });

  await t.test('a chat message over 4,000 characters is rejected with a clear message', async () => {
    const res = await api('POST', '/chat', { token: B.token, body: { message: 'a'.repeat(4001) } });
    assert.equal(res.status, 422, JSON.stringify(res.json));
    assert.match(JSON.stringify(res.json), /Messages can be up to 4,000 characters/);
  });
});
