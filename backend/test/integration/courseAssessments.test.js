'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drive the assessment + attempt services in-process against the real local DB
// with a stubbed Gemini (no real generation call). Same approach as
// personalization.test.js.
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};

let geminiCalls = 0;
function loadServices() {
  geminiCalls = 0;
  const gemini = require('../../src/services/geminiClient');
  gemini.callGemini = async () => {
    geminiCalls += 1;
    const items = Array.from({ length: 16 }, (_, i) => ({
      question: `Q${i + 1}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', explanation: 'because a',
    }));
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ topic: 'X', quizType: 'multiple_choice', items }) }] } }] };
  };
  for (const p of ['../../src/services/courseGenerationService', '../../src/services/quizService', '../../src/services/courseAssessmentService']) {
    delete require.cache[require.resolve(p)];
  }
  return {
    quizService: require('../../src/services/quizService'),
    assessmentService: require('../../src/services/courseAssessmentService'),
  };
}

const TAG = `qa.itest.assess.${Date.now()}`;
const subjectIds = [];

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const r = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', 'IT', ?, 1)",
    [`A-${suffix}-${Date.now() % 100000}`, email, suffix]
  );
  await db.query('INSERT INTO user_profiles (user_id, xp_points, level) VALUES (?, 0, 1)', [r.insertId]);
  return { id: r.insertId, email };
}

async function makeCourse(userId, nModules = 2) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'intermediate', 'g', 1)",
    [userId, `${TAG} course`]
  );
  subjectIds.push(s.insertId);
  const mods = [];
  for (let mi = 0; mi < nModules; mi += 1) {
    const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, ?)', [s.insertId, `Module ${mi + 1}`, mi]);
    const t = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, `Topic ${mi + 1}`]);
    const l = await db.query("INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, ?, 'x', 'medium')", [t.insertId, `Lesson ${mi + 1}`]);
    mods.push({ moduleId: m.insertId, topicId: t.insertId, lessonId: l.insertId });
  }
  return { subjectId: s.insertId, mods };
}

async function completeModule(userId, mod) {
  await db.query('INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)', [userId, mod.lessonId]).catch(() => {});
  await db.query(
    "INSERT INTO learning_progress (user_id, topic_id, progress_percent, status) VALUES (?, ?, 100, 'completed') ON DUPLICATE KEY UPDATE progress_percent = 100, status = 'completed'",
    [userId, mod.topicId]
  );
}

// Take an assessment quiz, answering the first `correctCount` questions right.
async function attempt(svc, userId, quizId, correctCount) {
  const start = await svc.quizService.startAttempt(userId, quizId);
  for (let i = 0; i < start.items.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await svc.quizService.saveAttemptAnswer(userId, start.attempt.id, {
      questionId: start.items[i].id, selectedAnswer: i < correctCount ? 'a' : 'b',
    });
  }
  return svc.quizService.submitAttempt(userId, start.attempt.id);
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

test('course assessments — module checkpoints + course final', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a');
  const B = await makeStudent('b');
  const svc = loadServices();
  const { subjectId, mods } = await makeCourse(A.id, 2);

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    for (const uid of [A.id, B.id]) {
      await db.query('DELETE FROM quiz_attempts WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM xp_events WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM dashboard_activity_log WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM notification_recipients WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM learning_streaks WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_profiles WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('UNLOCK: checkpoint locked until the module\'s lessons are complete', async () => {
    let map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(map.modules.length, 2);
    assert.equal(map.modules[0].checkpoint.status, 'locked');
    assert.equal(map.final.status, 'locked');

    await assert.rejects(
      () => svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[0].moduleId),
      (e) => e.statusCode === 409
    );

    await completeModule(A.id, mods[0]);
    map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(map.modules[0].checkpoint.status, 'ready');
  });

  await t.test('CHECKPOINT GENERATION: personalized, snapshot stored, no answer key, no duplicate on repeat/concurrent open', async () => {
    const before = geminiCalls;
    const [r1, r2, r3] = await Promise.all([
      svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[0].moduleId),
      svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[0].moduleId),
      svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[0].moduleId),
    ]);
    assert.equal(geminiCalls - before, 1, 'concurrent opens share one Gemini call');
    assert.equal(new Set([r1.id, r2.id, r3.id]).size, 1, 'one checkpoint quiz');
    assert.equal(r1.items.length, svc.quizService.CHECKPOINT_ITEMS);
    assert.equal(r1.assessmentKind, 'module_checkpoint');
    assert.equal(r1.passingScore, 70);
    assert.doesNotMatch(JSON.stringify(r1), /correct_?answer|correctAnswer|explanation|is_?correct/i);

    const rows = await db.query("SELECT COUNT(*) c FROM quizzes WHERE user_id = ? AND module_id = ? AND assessment_kind = 'module_checkpoint'", [A.id, mods[0].moduleId]);
    assert.equal(Number(rows[0].c), 1);
    const snap = await db.query('SELECT personalization_context FROM quizzes WHERE id = ?', [r1.id]);
    assert.equal(JSON.parse(snap[0].personalization_context).source, 'quiz_generation');

    const again = await svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[0].moduleId);
    assert.equal(geminiCalls - before, 1, 'a later open does not regenerate');
    assert.equal(again.id, r1.id);
  });

  await t.test('SUBMISSION: server grades, passing evaluated server-side, attempt.passed stored, fail keeps history', async () => {
    const map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    const quizId = map.modules[0].checkpoint.quizId;

    const fail = await attempt(svc, A.id, quizId, 2); // 2/8 = 25%
    assert.equal(fail.passed, false);
    assert.equal(fail.assessmentKind, 'module_checkpoint');
    assert.equal(fail.xpAwarded, 0, 'no XP for a failed checkpoint');
    assert.match(fail.recommendation.message, /Review the "Module 1" module/);
    const stored = await db.query('SELECT passed FROM quiz_attempts WHERE id = ?', [fail.attemptId]);
    assert.equal(stored[0].passed, 0);

    const mapAfterFail = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(mapAfterFail.modules[0].checkpoint.status, 'failed');
    assert.equal(mapAfterFail.modules[0].checkpoint.attemptCount, 1);
  });

  await t.test('XP: first checkpoint pass awards once, retake of a pass awards zero, pass-history wins', async () => {
    const map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    const quizId = map.modules[0].checkpoint.quizId;
    const xpBefore = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [A.id]))[0].xp_points;

    const pass = await attempt(svc, A.id, quizId, 8);
    assert.equal(pass.passed, true);
    assert.equal(pass.xpAwarded, svc.quizService.CHECKPOINT_PASS_XP);

    const worseRetake = await attempt(svc, A.id, quizId, 3); // 3/8 = fail as a score
    assert.equal(worseRetake.xpAwarded, 0, 'retake of a passed checkpoint awards no pass XP');

    const xpAfter = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [A.id]))[0].xp_points;
    assert.equal(xpAfter, xpBefore + svc.quizService.CHECKPOINT_PASS_XP);
    const led = await db.query("SELECT COUNT(*) c FROM xp_events WHERE user_id = ? AND event_key = ?", [A.id, `module_checkpoint_pass:${mods[0].moduleId}`]);
    assert.equal(Number(led[0].c), 1);

    const mapAfter = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(mapAfter.modules[0].checkpoint.status, 'passed', 'pass-history wins over a worse latest retake');
    assert.equal(mapAfter.modules[0].moduleCompleted, true);
    assert.equal(mapAfter.modules[0].checkpoint.passingScore, 70);
    assert.match(String(mapAfter.modules[0].checkpoint.latestScore), /^(37|38)$/); // 3/8 ~= 37.5%
  });

  await t.test('FINAL: locked until every checkpoint is passed, then generated once and covers the course', async () => {
    await assert.rejects(() => svc.assessmentService.openCourseFinal(A.id, subjectId), (e) => e.statusCode === 409);

    await completeModule(A.id, mods[1]);
    const cp2 = await svc.assessmentService.openModuleCheckpoint(A.id, subjectId, mods[1].moduleId);
    await attempt(svc, A.id, cp2.id, 8); // pass M2 checkpoint

    const map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(map.final.status, 'ready');
    assert.equal(map.prerequisitesForFinal.allCheckpointsPassed, true);

    const gBefore = geminiCalls;
    const finalTake = await svc.assessmentService.openCourseFinal(A.id, subjectId);
    assert.equal(finalTake.items.length, svc.quizService.FINAL_ITEMS);
    assert.equal(finalTake.assessmentKind, 'course_final');
    assert.doesNotMatch(JSON.stringify(finalTake), /correct_?answer|correctAnswer|explanation/i);
    await svc.assessmentService.openCourseFinal(A.id, subjectId);
    assert.equal(geminiCalls - gBefore, 1, 'the final is generated only once');

    const finalRows = await db.query("SELECT COUNT(*) c FROM quizzes WHERE user_id = ? AND subject_id = ? AND assessment_kind = 'course_final'", [A.id, subjectId]);
    assert.equal(Number(finalRows[0].c), 1);
  });

  await t.test('FINAL pass -> +100 XP once, courseCompleted true; concurrent submit cannot double the XP', async () => {
    const map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    const finalQuizId = map.final.quizId;
    const xpBefore = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [A.id]))[0].xp_points;

    // concurrent submit of one fresh attempt
    const start = await svc.quizService.startAttempt(A.id, finalQuizId);
    for (const item of start.items) {
      // eslint-disable-next-line no-await-in-loop
      await svc.quizService.saveAttemptAnswer(A.id, start.attempt.id, { questionId: item.id, selectedAnswer: 'a' });
    }
    const results = await Promise.allSettled([
      svc.quizService.submitAttempt(A.id, start.attempt.id),
      svc.quizService.submitAttempt(A.id, start.attempt.id),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.equal(ok.length, 1, 'exactly one submit wins; the other 409s');
    assert.equal(ok[0].passed, true);
    assert.equal(ok[0].xpAwarded, svc.quizService.FINAL_PASS_XP);

    const xpAfter = (await db.query('SELECT xp_points FROM user_profiles WHERE user_id = ?', [A.id]))[0].xp_points;
    assert.equal(xpAfter, xpBefore + svc.quizService.FINAL_PASS_XP);
    const led = await db.query("SELECT COUNT(*) c FROM xp_events WHERE user_id = ? AND event_key = ?", [A.id, `course_final_pass:${subjectId}`]);
    assert.equal(Number(led[0].c), 1);

    const finalMap = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    assert.equal(finalMap.final.status, 'passed');
    assert.equal(finalMap.courseCompleted, true);
  });

  await t.test('OWNERSHIP: another student gets 404 on read / open / attempt', async () => {
    const map = await svc.assessmentService.getCourseAssessments(A.id, subjectId);
    const checkpointQuizId = map.modules[0].checkpoint.quizId;

    await assert.rejects(() => svc.assessmentService.getCourseAssessments(B.id, subjectId), (e) => e.statusCode === 404);
    await assert.rejects(() => svc.assessmentService.openModuleCheckpoint(B.id, subjectId, mods[0].moduleId), (e) => e.statusCode === 404);
    await assert.rejects(() => svc.assessmentService.openCourseFinal(B.id, subjectId), (e) => e.statusCode === 404);
    await assert.rejects(() => svc.quizService.startAttempt(B.id, checkpointQuizId), (e) => e.statusCode === 404);
  });

  await t.test('HISTORY: practice quizzes still behave; assessment attempts carry kind + passed', async () => {
    const history = await svc.quizService.listQuizHistory(A.id);
    const assessmentRows = history.filter((r) => r.assessment_kind !== 'practice');
    assert.ok(assessmentRows.length >= 3, 'checkpoint + final attempts appear in history');
    assert.ok(assessmentRows.every((r) => r.passed === 0 || r.passed === 1), 'assessment attempts have a pass flag');

    // a plain practice quiz still awards quiz_completed XP and no pass flag
    const q = await db.query("INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'multiple_choice', 'medium', 2)", [A.id, `${TAG} practice`]);
    await db.query("INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, order_index) VALUES (?, 'p1', ?, 'a', 0), (?, 'p2', ?, 'a', 1)", [q.insertId, JSON.stringify(['a', 'b']), q.insertId, JSON.stringify(['a', 'b'])]);
    const practice = await attempt(svc, A.id, q.insertId, 2);
    assert.equal(practice.passed, null, 'practice quiz has no pass flag');
    assert.ok(practice.xpAwarded > 0, 'practice quiz still awards completion XP');
  });
});
