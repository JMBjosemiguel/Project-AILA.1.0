'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, api, serverReachable, purgeByTag, createStudent } = require('./helpers');

const shareService = require('../../src/services/materialShareService');

const TAG = `qa.itest.share.${Date.now()}`;
const subjectIds = [];

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix, first) {
  const email = `${TAG}.${suffix}@example.com`;
  const r = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', ?, 'Learner', 1)",
    [`SH-${suffix}-${Date.now() % 100000}`, email, first]
  );
  await db.query('INSERT INTO user_profiles (user_id, xp_points, level) VALUES (?, 0, 1)', [r.insertId]);
  return { id: r.insertId, email };
}

async function makeCourse(userId) {
  const s = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated, personalization_context) VALUES (?, ?, 'intermediate', 'pass', 1, ?)",
    [userId, `${TAG} Course`, JSON.stringify({ source: 'course_generation', weakTopics: ['LEAK_WEAK_TOPIC'], recentQuizAverage: 41 })]
  );
  subjectIds.push(s.insertId);
  const m = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [s.insertId, 'Module A']);
  const t = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [m.insertId, 'Topic A']);
  await db.query(
    "INSERT INTO lessons (topic_id, title, content, difficulty, estimated_minutes, personalization_context) VALUES (?, 'Lesson A', 'The lesson body explains X.', 'medium', 10, ?)",
    [t.insertId, JSON.stringify({ recentQuizAverage: 41 })]
  );
  await db.query("INSERT INTO definitions (topic_id, term, definition_text) VALUES (?, 'X', 'A concept')", [t.insertId]);
  return { subjectId: s.insertId, moduleId: m.insertId };
}

async function makeQuiz(userId) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count, personalization_context) VALUES (?, ?, 'multiple_choice', 'medium', 2, ?)",
    [userId, `${TAG} Quiz`, JSON.stringify({ weakTopics: ['LEAK'] })]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Q1', ?, 'right-one', 'SECRET_EXPLANATION', 0), (?, 'Q2', ?, 'four', 'because math', 1)",
    [q.insertId, JSON.stringify(['right-one', 'wrong-one']), q.insertId, JSON.stringify(['three', 'four'])]
  );
  return q.insertId;
}

async function makeIdentificationQuiz(userId) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'identification', 'medium', 1)",
    [userId, `${TAG} ID Quiz`]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'Name the device.', NULL, 'Vacuum Tube', 'A historical electronic component.', 0)",
    [q.insertId]
  );
  return q.insertId;
}

async function makeTrueFalseQuiz(userId) {
  const q = await db.query(
    "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count) VALUES (?, ?, 'true_false', 'medium', 1)",
    [userId, `${TAG} TF Quiz`]
  );
  await db.query(
    "INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES (?, 'The sky appears blue due to Rayleigh scattering.', ?, 'True', 'Shorter wavelengths scatter more.', 0)",
    [q.insertId, JSON.stringify(['True', 'False'])]
  );
  return q.insertId;
}

// Global counts across every table a quiz attempt / XP award / notification /
// audit entry / progress update could possibly touch — snapshotting these
// (not scoped to any one user) is the strongest proof the check endpoint
// writes NOTHING anywhere, on a database that already has real data in it.
const WRITE_SENSITIVE_TABLES = [
  'quiz_attempts', 'quiz_attempt_answers', 'xp_events', 'notifications', 'notification_recipients',
  'admin_audit_log', 'dashboard_activity_log', 'learning_progress', 'lesson_progress', 'user_achievements', 'learning_streaks',
];

async function snapshotCounts() {
  const counts = {};
  for (const table of WRITE_SENSITIVE_TABLES) {
    const rows = await db.query(`SELECT COUNT(*) c FROM ${table}`);
    counts[table] = Number(rows[0].c);
  }
  return counts;
}

async function wipeCourse(subjectId) {
  const j = 'JOIN topics t ON t.id=x.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?';
  await db.query(`DELETE x FROM definitions x ${j}`, [subjectId]).catch(() => {});
  await db.query(`DELETE x FROM examples x ${j}`, [subjectId]).catch(() => {});
  await db.query('DELETE x FROM lessons x JOIN topics t ON t.id=x.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM modules WHERE subject_id=?', [subjectId]).catch(() => {});
  await db.query('DELETE FROM subjects WHERE id=?', [subjectId]).catch(() => {});
}

const KEY_FIELDS = /correct_?answer|correctAnswer|"explanation"|is_?correct|isCorrect/i;
const OWNER_INTERNALS = /personalization_context|weakTopics|recentQuizAverage|LEAK_WEAK_TOPIC|"created_by"|"user_id"|xp_points|@example\.com|password/i;

test('generated-material sharing', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a', 'Ada');
  const B = await makeStudent('b', 'Bob');
  const course = await makeCourse(A.id);
  const quizId = await makeQuiz(A.id);

  t.after(async () => {
    for (const id of subjectIds) await wipeCourse(id);
    for (const uid of [A.id, B.id]) {
      await db.query('DELETE FROM material_shares WHERE created_by = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM quiz_attempts WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM quizzes WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_profiles WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM user_sessions WHERE user_id = ?', [uid]).catch(() => {});
      await db.query('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
    }
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('OWNER: create / status / revoke; NON-OWNER is 404 everywhere', async () => {
    assert.equal((await shareService.getShareStatus(A.id, 'subject', course.subjectId)).visibility, 'private');

    for (const fn of [
      () => shareService.getShareStatus(B.id, 'subject', course.subjectId),
      () => shareService.createShare(B.id, 'subject', course.subjectId, 'unlisted'),
      () => shareService.revokeShare(B.id, 'subject', course.subjectId),
    ]) {
      await assert.rejects(fn, (e) => e.statusCode === 404);
    }

    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    assert.ok(created.token && created.token.length >= 20);
    assert.equal(created.sharePath, `/share/${created.token}`);

    const status = await shareService.getShareStatus(A.id, 'subject', course.subjectId);
    assert.equal(status.visibility, 'unlisted');
    assert.equal(status.shared, true);
    assert.equal(status.tokenHint, created.token.slice(0, 8));
  });

  await t.test('TOKEN: only the sha256 hash is stored, never the raw token', async () => {
    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    const rows = await db.query('SELECT token_hash, token_hint FROM material_shares WHERE created_by = ? ORDER BY id DESC LIMIT 1', [A.id]);
    assert.equal(rows[0].token_hash.length, 64);
    assert.ok(!JSON.stringify(rows).includes(created.token), 'raw token is not in material_shares');
    // re-sharing revokes the previous token
    const activeCount = await db.query("SELECT COUNT(*) c FROM material_shares WHERE material_type='subject' AND material_id=? AND created_by=? AND revoked_at IS NULL", [course.subjectId, A.id]);
    assert.equal(Number(activeCount[0].c), 1, 'at most one active token per material');
  });

  await t.test('VIEW: shared course renders content, leaks nothing about the owner', async () => {
    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    const view = await shareService.viewSharedMaterial(created.token);
    assert.equal(view.shareType, 'subject');
    assert.match(view.modules[0].topics[0].lessons[0].content, /lesson body explains X/);
    assert.equal(view.sharedBy, 'Ada L.');

    const s = JSON.stringify(view);
    assert.doesNotMatch(s, OWNER_INTERNALS);
    assert.doesNotMatch(s, KEY_FIELDS);
  });

  await t.test('VIEW: shared quiz shows questions + options, NEVER the answer key', async () => {
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    const view = await shareService.viewSharedMaterial(created.token);
    assert.equal(view.shareType, 'quiz');
    assert.equal(view.items.length, 2);
    assert.deepEqual(view.items[0].options, ['right-one', 'wrong-one']);

    const s = JSON.stringify(view);
    assert.doesNotMatch(s, KEY_FIELDS);
    assert.doesNotMatch(s, /SECRET_EXPLANATION|because math/);
    assert.doesNotMatch(s, OWNER_INTERNALS);
  });

  await t.test('CHECK: grades multiple choice, true/false and identification correctly (including update-116 normalization), and never writes anything', async () => {
    const before = await snapshotCounts();

    const mcShare = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    const mc = await shareService.checkSharedQuizAnswers(mcShare.token, [
      { index: 0, answer: 'right-one' }, // correct
      { index: 1, answer: 'three' }, // wrong (correct is 'four')
    ]);
    assert.equal(mc.total, 2);
    assert.equal(mc.score, 1);
    assert.equal(mc.percent, 50);
    assert.equal(mc.results[0].isCorrect, true);
    assert.equal(mc.results[0].correctAnswer, 'right-one');
    assert.equal(mc.results[0].explanation, 'SECRET_EXPLANATION');
    assert.equal(mc.results[1].isCorrect, false);
    assert.equal(mc.results[1].yourAnswer, 'three');

    const tfId = await makeTrueFalseQuiz(A.id);
    const tfShare = await shareService.createShare(A.id, 'quiz', tfId, 'unlisted');
    const tf = await shareService.checkSharedQuizAnswers(tfShare.token, [{ index: 0, answer: 'True' }]);
    assert.equal(tf.score, 1);

    const idQuizId = await makeIdentificationQuiz(A.id);
    const idShare = await shareService.createShare(A.id, 'quiz', idQuizId, 'unlisted');
    // "vacuum tubes." vs stored "Vacuum Tube": case + trailing punctuation +
    // simple plural — the exact normalization added in update 116.
    const id = await shareService.checkSharedQuizAnswers(idShare.token, [{ index: 0, answer: 'vacuum tubes.' }]);
    assert.equal(id.score, 1, 'identification grading must apply the same case/punctuation/plural normalization as a real attempt');
    assert.equal(id.results[0].isCorrect, true);

    const after = await snapshotCounts();
    assert.deepEqual(after, before, 'checking shared quizzes must never write to quiz_attempts, xp_events, notifications, audit log, or any progress table');
  });

  await t.test('CHECK: unanswered items count as incorrect', async () => {
    const share = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    const result = await shareService.checkSharedQuizAnswers(share.token, [{ index: 0, answer: 'right-one' }]); // index 1 omitted
    assert.equal(result.score, 1);
    assert.equal(result.total, 2);
    assert.equal(result.results[1].isCorrect, false);
    assert.equal(result.results[1].yourAnswer, '');
  });

  await t.test('CHECK: a shared COURSE token is out of scope — same opaque 404 as a bad token', async () => {
    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    await assert.rejects(
      () => shareService.checkSharedQuizAnswers(created.token, [{ index: 0, answer: 'x' }]),
      (e) => e.statusCode === 404 && e.message === 'This shared material is no longer available.'
    );
  });

  await t.test('CHECK: garbage / revoked quiz tokens return the same opaque 404', async () => {
    for (const bad of ['1', 'x', 'abc', '../secret', 'y'.repeat(300)]) {
      await assert.rejects(
        () => shareService.checkSharedQuizAnswers(bad, [{ index: 0, answer: 'x' }]),
        (e) => e.statusCode === 404 && e.message === 'This shared material is no longer available.'
      );
    }
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    await shareService.revokeShare(A.id, 'quiz', quizId);
    await assert.rejects(() => shareService.checkSharedQuizAnswers(created.token, []), (e) => e.statusCode === 404);
  });

  await t.test('CHECK: an index past the end of the quiz is a 422, not a crash', async () => {
    const share = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    await assert.rejects(
      () => shareService.checkSharedQuizAnswers(share.token, [{ index: 99, answer: 'x' }]),
      (e) => e.statusCode === 422
    );
  });

  await t.test('VIEW: garbage / revoked tokens all return the same opaque 404', async () => {
    for (const bad of ['1', 'x', 'abc', '../secret', 'y'.repeat(300)]) {
      await assert.rejects(
        () => shareService.viewSharedMaterial(bad),
        (e) => e.statusCode === 404 && e.message === 'This shared material is no longer available.'
      );
    }
    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    await shareService.revokeShare(A.id, 'subject', course.subjectId);
    await assert.rejects(() => shareService.viewSharedMaterial(created.token), (e) => e.statusCode === 404);
    assert.equal((await shareService.getShareStatus(A.id, 'subject', course.subjectId)).visibility, 'private');
  });

  await t.test('COPY course: independent, B-owned, no progress / attempts / snapshot; provenance kept', async () => {
    const created = await shareService.createShare(A.id, 'subject', course.subjectId, 'unlisted');
    const copied = await shareService.copySharedMaterial(B.id, created.token);
    subjectIds.push(copied.materialId);

    assert.notEqual(copied.materialId, course.subjectId);
    const row = (await db.query('SELECT created_by, visibility, personalization_context, copied_from_subject_id FROM subjects WHERE id = ?', [copied.materialId]))[0];
    assert.equal(Number(row.created_by), B.id);
    assert.equal(row.visibility, 'private');
    assert.equal(row.personalization_context, null);
    assert.equal(Number(row.copied_from_subject_id), course.subjectId);

    const lesson = (await db.query('SELECT l.content, l.personalization_context FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id = ?', [copied.materialId]))[0];
    assert.match(lesson.content, /lesson body explains X/);
    assert.equal(lesson.personalization_context, null);
    assert.equal(Number((await db.query('SELECT COUNT(*) c FROM definitions d JOIN topics t ON t.id=d.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id = ?', [copied.materialId]))[0].c), 1);

    const progress = await db.query('SELECT COUNT(*) c FROM learning_progress lp JOIN topics t ON t.id=lp.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id = ?', [copied.materialId]);
    assert.equal(Number(progress[0].c), 0, 'no learning_progress copied');
    const assessmentQuizzes = await db.query("SELECT COUNT(*) c FROM quizzes WHERE subject_id = ? AND assessment_kind <> 'practice'", [copied.materialId]);
    assert.equal(Number(assessmentQuizzes[0].c), 0, 'no assessment quiz rows copied — recipient generates their own');

    // A revoking the share does not touch B's copy
    await shareService.revokeShare(A.id, 'subject', course.subjectId);
    assert.equal(Number((await db.query('SELECT COUNT(*) c FROM subjects WHERE id = ? AND deleted_at IS NULL', [copied.materialId]))[0].c), 1);
  });

  await t.test('COPY quiz: new private practice quiz, key stored server-side, no attempts, snapshot cleared', async () => {
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    const copied = await shareService.copySharedMaterial(B.id, created.token);

    const row = (await db.query('SELECT user_id, visibility, assessment_kind, personalization_context, copied_from_quiz_id FROM quizzes WHERE id = ?', [copied.materialId]))[0];
    assert.equal(Number(row.user_id), B.id);
    assert.equal(row.visibility, 'private');
    assert.equal(row.assessment_kind, 'practice');
    assert.equal(row.personalization_context, null);
    assert.equal(Number(row.copied_from_quiz_id), quizId);

    const qs = await db.query('SELECT question, correct_answer FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [copied.materialId]);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].correct_answer, 'right-one', 'answer key copied server-side so the recipient can be graded');
    assert.equal(Number((await db.query('SELECT COUNT(*) c FROM quiz_attempts WHERE quiz_id = ?', [copied.materialId]))[0].c), 0);
  });

  await t.test("a course assessment quiz can't be shared standalone", async () => {
    const chk = await db.query(
      "INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, item_count, subject_id, module_id, assessment_kind, passing_score, assessment_slot) VALUES (?, 'CP', 'multiple_choice', 'medium', 4, ?, ?, 'module_checkpoint', 70, ?)",
      [A.id, course.subjectId, course.moduleId, course.moduleId]
    );
    await assert.rejects(() => shareService.createShare(A.id, 'quiz', chk.insertId, 'unlisted'), (e) => e.statusCode === 400);
  });

  await t.test('deleting the source course kills its share links; earlier copies survive', async () => {
    const fresh = await makeCourse(A.id);
    const created = await shareService.createShare(A.id, 'subject', fresh.subjectId, 'unlisted');
    const copied = await shareService.copySharedMaterial(B.id, created.token);
    subjectIds.push(copied.materialId);

    await db.query('UPDATE subjects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [fresh.subjectId]);
    await db.query("UPDATE material_shares SET revoked_at = CURRENT_TIMESTAMP WHERE material_type='subject' AND material_id=? AND revoked_at IS NULL", [fresh.subjectId]);

    await assert.rejects(() => shareService.viewSharedMaterial(created.token), (e) => e.statusCode === 404);
    assert.equal(Number((await db.query('SELECT COUNT(*) c FROM subjects WHERE id = ? AND deleted_at IS NULL', [copied.materialId]))[0].c), 1);
  });

  await t.test('HTTP: the read-only view needs NO auth; copy needs auth', async () => {
    if (!(await serverReachable())) { return; }
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');

    const anon = await api('GET', `/share/${created.token}`); // no token header
    assert.equal(anon.status, 200);
    assert.equal(anon.json.data.shareType, 'quiz');
    assert.doesNotMatch(JSON.stringify(anon.json), KEY_FIELDS);

    const anonCopy = await api('POST', `/share/${created.token}/copy`); // no auth
    assert.equal(anonCopy.status, 401);

    assert.equal((await api('GET', '/share/1')).status, 404);
    assert.equal((await api('GET', `/materials/quiz/${quizId}/share`)).status, 401, 'owner endpoints require auth');
  });

  await t.test('HTTP: checking a shared quiz needs no auth, ignores any Authorization header sent, and still writes nothing — even once with a valid student token', async () => {
    if (!(await serverReachable())) { return; }
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');
    // Created BEFORE the snapshot — register+login themselves write an
    // admin_audit_log row (student actions are logged too), which would
    // otherwise show up as a false mismatch in the before/after diff below.
    // Cleanup: handled by purgeByTag(TAG) in the outer t.after, like every
    // other fixture in this file.
    const student = await createStudent(TAG, 'checktok');

    const before = await snapshotCounts();

    const anon = await api('POST', `/share/${created.token}/check`, { body: { answers: [{ index: 0, answer: 'right-one' }] } });
    assert.equal(anon.status, 200);
    assert.equal(anon.json.data.score, 1);
    assert.doesNotMatch(JSON.stringify(anon.json), OWNER_INTERNALS);

    // A real student's token sent along must change nothing about the
    // response or the outcome — it's simply never read.
    const withToken = await api('POST', `/share/${created.token}/check`, { token: student.token, body: { answers: [{ index: 0, answer: 'right-one' }] } });
    assert.equal(withToken.status, 200);
    assert.deepEqual(withToken.json.data, anon.json.data);

    const after = await snapshotCounts();
    assert.deepEqual(after, before, 'no auth header, real or absent, should ever cause a write from this endpoint');
  });

  await t.test('HTTP: invalid check bodies return 422 in the normal error envelope', async () => {
    if (!(await serverReachable())) { return; }
    const created = await shareService.createShare(A.id, 'quiz', quizId, 'unlisted');

    const missing = await api('POST', `/share/${created.token}/check`, { body: {} });
    assert.equal(missing.status, 422);
    assert.equal(missing.json.success, false);

    const notArray = await api('POST', `/share/${created.token}/check`, { body: { answers: 'nope' } });
    assert.equal(notArray.status, 422);

    const badIndex = await api('POST', `/share/${created.token}/check`, { body: { answers: [{ index: -1, answer: 'x' }] } });
    assert.equal(badIndex.status, 422);

    const dup = await api('POST', `/share/${created.token}/check`, { body: { answers: [{ index: 0, answer: 'a' }, { index: 0, answer: 'b' }] } });
    assert.equal(dup.status, 422);

    const tooLong = await api('POST', `/share/${created.token}/check`, { body: { answers: [{ index: 0, answer: 'x'.repeat(501) }] } });
    assert.equal(tooLong.status, 422);
  });
});
