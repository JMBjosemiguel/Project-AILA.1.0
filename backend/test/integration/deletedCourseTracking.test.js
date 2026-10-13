'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, createStudent, purgeByTag } = require('./helpers');

const studentContext = require('../../src/services/studentContextService');
const quizModel = require('../../src/models/quizModel');
const analyticsModel = require('../../src/models/analyticsModel');

const TAG = `qa.itest.delcourse.${Date.now()}`;
const createdSubjectIds = [];

// Mirrors personalization.test.js's seedWeakCourse: a full course/module/
// topic/lesson tree with one topic-sourced quiz attempt scored at `percent`,
// built directly via SQL so this test needs no Gemini call.
async function seedWeakCourse(userId, topicTitle, percent) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', ?, 1)",
    [userId, `${TAG} ${topicTitle} course`, `${TAG} goal`]
  );
  const subjectId = s.insertId;
  createdSubjectIds.push(subjectId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [subjectId, `${TAG} M`]);
  const t = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, topicTitle]);
  const topicId = t.insertId;
  const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, NULL, 'medium')", [topicId, `${TAG} ${topicTitle} lesson`]);
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, source_id, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 'topic', ?, 4)",
    [userId, topicTitle, topicId]
  );
  await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'q', NULL, 'a', 'x', 0)", [q.insertId]);
  await db.query(
    "INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, 100, 'submitted', NOW())",
    [q.insertId, userId, percent]
  );
  return { subjectId, topicId, lessonId: l.insertId, quizId: q.insertId };
}

// A chat-quiz attempt — no source_type/source_id, no subject_id — must keep
// counting after ANY course is deleted; it was never tied to one.
async function seedChatQuizAttempt(userId, percent) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 4)",
    [userId, `${TAG} chat quiz`]
  );
  await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'q', NULL, 'a', 'x', 0)", [q.insertId]);
  await db.query(
    "INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, completed_at) VALUES (?, ?, ?, 100, 'submitted', NOW())",
    [q.insertId, userId, percent]
  );
  return q.insertId;
}

async function wipeCourse(subjectId) {
  const tail = 'JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE lp FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query(`DELETE l FROM lessons l ${tail}`, [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

test('deleted course tracking', async (t) => {
  if (!(await serverReachable())) {
    t.skip('local backend not reachable on /health — start it with `npm run dev`');
    return;
  }

  const student = await createStudent(TAG, 'delcourse');
  const course = await seedWeakCourse(student.id, `${TAG} Weak Topic`, 10);
  const chatQuizId = await seedChatQuizAttempt(student.id, 90);

  t.after(async () => {
    for (const id of createdSubjectIds) await wipeCourse(id);
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('before deletion: the weak topic shows up everywhere it should', async () => {
    const weak = await studentContext.getWeakTopics(student.id);
    assert.ok(weak.some((w) => w.topic === `${TAG} Weak Topic`), 'weak topic present before delete');

    const recent = await studentContext.getRecentQuizAverage(student.id);
    assert.ok(recent && recent.attemptCount >= 1);

    const avg = await quizModel.getQuizAverageScore(student.id);
    assert.ok(Number(avg.attempt_count) >= 2, 'both the course quiz and the chat quiz count before delete');
  });

  await t.test('deleting the course removes it from Learning Hub and from every tracking surface', async () => {
    const before = await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [student.id]);
    const xpBefore = before[0].xp_points;

    const del = await api('DELETE', `/subjects/${course.subjectId}`, { token: student.token });
    assert.equal(del.status, 200, JSON.stringify(del.json));

    // Gone from the Learning Hub's own list.
    const list = await api('GET', '/subjects', { token: student.token });
    assert.ok(!list.json.data.subjects?.some((s) => s.id === course.subjectId), 'deleted course no longer listed in Learning Hub');

    // Gone from weak topics (the exact bug: the Dashboard AI insight).
    const weak = await studentContext.getWeakTopics(student.id);
    assert.ok(!weak.some((w) => w.topic === `${TAG} Weak Topic`), 'weak topic no longer surfaced after delete');

    const recommendation = studentContext.buildRecommendation(await studentContext.getStudentContext(student.id));
    assert.notEqual(recommendation.type, 'weak_topic');

    const summary = studentContext.buildContextSummaryText(await studentContext.getStudentContext(student.id));
    assert.doesNotMatch(summary, new RegExp(`${TAG} Weak Topic`));

    // Analytics' quiz performance trend for today drops the deleted course's
    // 10% attempt and keeps only the chat quiz's 90% — not an average of both.
    const trend = await analyticsModel.getQuizPerformanceTrend(student.id);
    const today = trend[trend.length - 1];
    assert.equal(Number(today.avg_percent), 90);

    // Chat quiz (never tied to a course) still counts.
    const avgAfter = await quizModel.getQuizAverageScore(student.id);
    assert.ok(Number(avgAfter.attempt_count) >= 1, 'the chat-quiz attempt still counts');
    const recentAfter = await studentContext.getRecentQuizAverage(student.id);
    assert.ok(recentAfter && recentAfter.attemptCount >= 1);

    const history = await quizModel.listAttemptsForUser(student.id, 50);
    assert.ok(history.some((h) => h.quiz_id === chatQuizId), 'chat quiz still appears in quiz history');
    assert.ok(!history.some((h) => h.quiz_id === course.quizId), 'the deleted course\'s quiz no longer appears in history');

    // Nothing was deleted at the row level — just filtered.
    const [row] = await db.query('SELECT deleted_at FROM subjects WHERE id = ?', [course.subjectId]);
    assert.ok(row.deleted_at, 'soft-deleted, not removed');
    const [stillThere] = await db.query('SELECT COUNT(*) AS n FROM quiz_attempts WHERE quiz_id = ?', [course.quizId]);
    assert.equal(Number(stillThere.n), 1, 'the quiz attempt row itself is never deleted');

    // XP/levels/streaks are untouched by deleting a course.
    const after = await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [student.id]);
    assert.equal(after[0].xp_points, xpBefore, 'XP is unaffected by deleting a course');
  });
});
