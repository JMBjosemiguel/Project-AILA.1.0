'use strict';
/*
 * Second audit fixes: one quiz-average rule for the Knowledge Base list, the
 * Users table, user details and "Most active"; weekly results and the
 * dashboard's quiz-attempt total count students only; reset progress clears
 * the matching activity rows; the audit-log CSV opens cleanly in Excel.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_URL, db, api, serverReachable, createStudent, loginAdmin, purgeByTag } = require('./helpers');
const adminModel = require('../../src/models/adminModel');
const adminService = require('../../src/services/adminService');
const adminAnalyticsModel = require('../../src/models/adminAnalyticsModel');
const quizModel = require('../../src/models/quizModel');

const TAG = `qa.itest.audit2.${Date.now()}`;
const subjectIds = [];

async function makeCourse(userId) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course ${subjectIds.length}`]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module 1']);
  const tp = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, `${TAG} topic`]);
  const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, 'x', 'medium')", [tp.insertId, 'Lesson 1']);
  return { subjectId: s.insertId, name: `${TAG} course ${subjectIds.length - 1}`, moduleId: m.insertId, lessonId: l.insertId };
}

// modules -> subjects has no ON DELETE CASCADE, so courses go before purgeByTag.
async function wipeCourse(subjectId) {
  const tail = 'JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id ${tail}`, [subjectId]).catch(() => {});
  await db.query(`DELETE l FROM lessons l ${tail}`, [subjectId]).catch(() => {});
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

async function addAttempt(userId, quizId, score, { status = 'submitted', total = 10 } = {}) {
  await db.query(
    'INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
    [quizId, userId, score, total, status, status === 'submitted' ? new Date() : null]
  );
}

test('second audit fixes', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health');
    return;
  }

  const adminToken = await loginAdmin();
  const adminId = (await api('GET', '/auth/me', { token: adminToken })).json.data.user.id;

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    await db.query('DELETE qa FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id WHERE q.topic LIKE ?', [`${TAG}%`]).catch(() => {});
    await db.query('DELETE FROM quizzes WHERE topic LIKE ?', [`${TAG}%`]).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('the Knowledge Base course list shows the same quiz average as the course detail', async () => {
    const E = await createStudent(TAG, 'e');
    const course = await makeCourse(E.id);
    await addAttempt(E.id, await makeQuiz(E.id, { topic: 'lesson quiz', sourceType: 'lesson', sourceId: course.lessonId }), 4);
    await addAttempt(E.id, await makeQuiz(E.id, { topic: 'checkpoint', kind: 'module_checkpoint', subjectId: course.subjectId, moduleId: course.moduleId }), 8);
    const unfinished = await makeQuiz(E.id, { topic: 'unfinished', sourceType: 'lesson', sourceId: course.lessonId });
    await addAttempt(E.id, unfinished, 0, { status: 'in_progress' });

    const { rows } = await adminModel.listSubjectsAdmin({ search: course.name });
    const row = rows.find((r) => r.id === course.subjectId);
    assert.ok(row, JSON.stringify(rows));
    assert.equal(Number(row.avg_quiz_score), 60, '(40% + 80%) / 2: the checkpoint counts, the unfinished attempt does not');
    assert.equal(Number((await adminService.getCourseDetail(course.subjectId)).avgQuizScore), 60);
  });

  await t.test('quizzes from a deleted course drop out of every average, matching the student dashboard', async () => {
    const G = await createStudent(TAG, 'g');
    const course = await makeCourse(G.id);
    await addAttempt(G.id, await makeQuiz(G.id, { topic: 'course quiz', sourceType: 'lesson', sourceId: course.lessonId }), 4);
    await addAttempt(G.id, await makeQuiz(G.id, { topic: 'checkpoint g', kind: 'module_checkpoint', subjectId: course.subjectId, moduleId: course.moduleId }), 2);
    await addAttempt(G.id, await makeQuiz(G.id, { topic: 'no course quiz' }), 8);
    await db.query('UPDATE subjects SET deleted_at = NOW() WHERE id = ?', [course.subjectId]);

    const dashboard = await quizModel.getQuizAverageScore(G.id);
    assert.equal(Number(dashboard.avg_percent), 80, 'the student dashboard');

    const users = await api('GET', `/admin/users?search=${encodeURIComponent(G.email)}`, { token: adminToken });
    assert.equal(Number(users.json.data.users.find((u) => u.id === G.id).avg_quiz_score), 80, 'the Users table');

    const detail = await adminModel.getUserDetail(G.id);
    assert.equal(Number(detail.quizAverage), 80, 'user details');

    const active = (await adminAnalyticsModel.getMostActiveStudents(100000)).find((s) => s.id === G.id);
    assert.equal(active.avg_quiz_score, 80, 'most active students');
    assert.equal(active.quizzes_completed, 1);
  });

  await t.test('weekly results and the dashboard quiz-attempt total count students only', async () => {
    const H = await createStudent(TAG, 'h');
    const X = await createStudent(TAG, 'x'); // will be deleted
    const course = await makeCourse(H.id);
    const weekly = async () => (await adminAnalyticsModel.getWeeklyResults()).at(-1);
    const totalAttempts = async () => Number((await adminModel.getDashboardStats()).totalQuizAttempts);

    const [weekBefore, totalBefore] = [await weekly(), await totalAttempts()];

    const studentQuiz = await makeQuiz(H.id, { topic: 'h quiz', sourceType: 'lesson', sourceId: course.lessonId });
    await addAttempt(H.id, studentQuiz, 6);
    await addAttempt(H.id, studentQuiz, 0, { status: 'in_progress' });
    await addAttempt(H.id, await makeQuiz(H.id, { topic: 'h chat', sourceType: 'chat' }), 0);
    const adminQuiz = await makeQuiz(adminId, { topic: 'admin quiz', sourceType: 'lesson', sourceId: course.lessonId });
    await addAttempt(adminId, adminQuiz, 10);
    await addAttempt(X.id, await makeQuiz(X.id, { topic: 'x quiz' }), 10);
    await db.query(
      'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, CURRENT_TIMESTAMP), (?, ?, CURRENT_TIMESTAMP), (?, ?, CURRENT_TIMESTAMP)',
      [H.id, course.lessonId, adminId, course.lessonId, X.id, course.lessonId]
    );
    await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [X.id]);

    const [weekAfter, totalAfter] = [await weekly(), await totalAttempts()];
    assert.equal(weekAfter.quizzesCompleted - weekBefore.quizzesCompleted, 1, "only the student's finished attempt");
    assert.equal(weekAfter.lessonsCompleted - weekBefore.lessonsCompleted, 1, "only the student's lesson");
    if (weekBefore.quizzesCompleted === 0) assert.equal(weekAfter.avgQuizScore, 60, 'the admin 100% is not averaged in');
    assert.equal(totalAfter - totalBefore, 1, 'Total quiz attempts: submitted, non-chat, by a student');
  });

  await t.test('reset progress also removes the quiz, lesson and XP activity rows', async () => {
    const R = await createStudent(TAG, 'r');
    await db.query(
      `INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES
        (?, 'quiz_completed', 1, 'Scored 4/5'), (?, 'lesson_completed', 1, 'Completed lesson'),
        (?, 'xp_earned', 1, '+10 XP'), (?, 'resource_viewed', 1, 'Viewed resource')`,
      [R.id, R.id, R.id, R.id]
    );
    const res = await api('POST', `/admin/users/${R.id}/reset-progress`, { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const left = await db.query('SELECT activity_type FROM dashboard_activity_log WHERE user_id = ? ORDER BY id', [R.id]);
    assert.deepEqual(left.map((r) => r.activity_type), ['resource_viewed']);
  });

  await t.test('the audit-log CSV starts with a UTF-8 BOM and gives times in the app timezone', async () => {
    const res = await fetch(`${BASE_URL}/admin/audit-log/export`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM');
    const text = new TextDecoder().decode(bytes.slice(3));
    const [header, first] = text.split('\n');
    assert.match(header, /^Timestamp \([^)]+\),User,Email,Role,Action,/);
    if (first) assert.match(first, /^"[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M",/, first);
  });
});
