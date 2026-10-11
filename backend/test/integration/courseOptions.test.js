'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, purgeByTag } = require('./helpers');

// Drives learningService in-process against the real local DB with a
// stubbed Gemini — same convention as courseAssessments.test.js /
// chatIntent.test.js (re-require after installing the stub so the modules
// that destructured callGemini/getResponseText at load time pick it up).
const notify = require('../../src/utils/notify');
notify.notifyUser = async () => {};

function jsonPayload(obj, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(obj) }] } }] };
}
function textPayload(text, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}

const SAMPLE_ROADMAP = {
  modules: [
    { title: 'Module 1', topics: [{ title: 'Topic 1', lessons: [{ title: 'Lesson 1', estimatedMinutes: 15 }] }] },
  ],
};

// Routes each Gemini call by inspecting its systemInstruction — roadmap vs
// lesson generation use distinctive rule text (ROADMAP_SYSTEM_RULES vs
// LESSON_SYSTEM_RULES), same trick as chatIntent.test.js's installGeminiStub.
function installGeminiStub() {
  const gemini = require('../../src/services/geminiClient');
  const calls = [];
  gemini.callGemini = async (body) => {
    calls.push(body);
    const instr = body.systemInstruction || '';
    if (instr.includes('college-level course roadmaps')) {
      return jsonPayload(SAMPLE_ROADMAP);
    }
    if (instr.includes('single, focused college lesson')) {
      return textPayload('## Objectives\nSomething real.\n## Summary\nA summary.');
    }
    throw new Error(`unexpected Gemini call in courseOptions.test.js: ${instr.slice(0, 80)}`);
  };
  for (const p of ['../../src/services/courseGenerationService', '../../src/services/learningService']) {
    delete require.cache[require.resolve(p)];
  }
  return { learningService: require('../../src/services/learningService'), calls };
}

const TAG = `qa.itest.courseopts.${Date.now()}`;

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

async function makeStudent(suffix) {
  const email = `${TAG}.${suffix}@example.com`;
  const res = await db.query(
    "INSERT INTO users (role_id, student_number, email, password_hash, first_name, last_name, is_active) VALUES (1, ?, ?, 'x', 'ITest', ?, 1)",
    [`CO-${suffix}-${Date.now() % 100000}`, email, suffix]
  );
  return { id: res.insertId, email };
}

// A "legacy" course — created directly, with NO personalization_context at
// all, exactly like every course generated before this feature existed.
async function makeLegacyCourse(userId) {
  const subject = await db.query(
    "INSERT INTO subjects (created_by, name, difficulty, goal, is_ai_generated) VALUES (?, ?, 'beginner', 'g', 1)",
    [userId, `${TAG} Legacy Course`]
  );
  const subjectId = subject.insertId;
  const module_ = await db.query('INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, 0)', [subjectId, 'M1']);
  const topic = await db.query('INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, 0)', [module_.insertId, 'T1']);
  const lesson = await db.query(
    "INSERT INTO lessons (topic_id, title, content, difficulty) VALUES (?, 'L1', NULL, 'medium')",
    [topic.insertId]
  );
  return { subjectId, lessonId: lesson.insertId };
}

async function subjectRow(subjectId) {
  const [row] = await db.query('SELECT personalization_context FROM subjects WHERE id = ?', [subjectId]);
  return row;
}

function systemInstructionOf(calls, matcher) {
  return calls.find((c) => matcher.test(c.systemInstruction || ''))?.systemInstruction || '';
}

test('course options (purpose, length, focus)', async (t) => {
  if (!(await dbReachable())) { t.skip('local database not reachable'); return; }

  const A = await makeStudent('a');
  const subjectIds = [];

  t.after(async () => {
    for (const id of subjectIds) {
      await db.query('DELETE lpr FROM lesson_progress lpr JOIN lessons l ON l.id=lpr.lesson_id JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [id]).catch(() => {});
      await db.query('DELETE l FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [id]).catch(() => {});
      await db.query('DELETE t FROM topics t JOIN modules m ON m.id=t.module_id WHERE m.subject_id=?', [id]).catch(() => {});
      await db.query('DELETE FROM modules WHERE subject_id=?', [id]).catch(() => {});
      await db.query('DELETE FROM subjects WHERE id=?', [id]).catch(() => {});
    }
    await db.query('DELETE FROM users WHERE id = ?', [A.id]).catch(() => {});
    await purgeByTag(TAG);
    await db.pool.end();
  });

  await t.test('generating a course with explicit options stores them and shapes the roadmap prompt', async () => {
    const { learningService, calls } = installGeminiStub();
    const result = await learningService.generateCourse(A.id, {
      courseName: `${TAG} NLE Prep`, difficulty: 'intermediate', goal: 'Pass the board exam',
      purpose: 'board_exam', length: 'short', focus: ['case_scenarios', 'key_terms'],
    });
    subjectIds.push(result.subjectId);

    const roadmapInstruction = systemInstructionOf(calls, /college-level course roadmaps/);
    assert.match(roadmapInstruction, /NLE/);
    assert.match(roadmapInstruction, /2-3 modules total/);
    assert.match(roadmapInstruction, /case scenarios|patient cases/i);
    assert.match(roadmapInstruction, /key terms/i);

    const row = await subjectRow(result.subjectId);
    const stored = JSON.parse(row.personalization_context);
    assert.deepEqual(stored.courseOptions, { purpose: 'board_exam', length: 'short', focus: ['case_scenarios', 'key_terms'] });
  });

  await t.test('the quick flow (course name only) still works, and stores the chosen defaults', async () => {
    const { learningService } = installGeminiStub();
    const result = await learningService.generateCourse(A.id, { courseName: `${TAG} Quick Flow`, goal: '' });
    subjectIds.push(result.subjectId);

    const row = await subjectRow(result.subjectId);
    const stored = JSON.parse(row.personalization_context);
    assert.deepEqual(stored.courseOptions, { purpose: 'from_scratch', length: 'standard', focus: [] });
  });

  await t.test('a standard-length roadmap prompt is byte-identical to the pre-feature "2-4 modules" rule', async () => {
    const { learningService, calls } = installGeminiStub();
    const result = await learningService.generateCourse(A.id, { courseName: `${TAG} Standard Length` });
    subjectIds.push(result.subjectId);

    const roadmapInstruction = systemInstructionOf(calls, /college-level course roadmaps/);
    assert.match(roadmapInstruction, /Produce 2-4 modules, each with 2-3 topics, each topic with 1-2 lessons\./);
    assert.doesNotMatch(roadmapInstruction, /modules total/, 'no length override line for the default length');
  });

  await t.test('the course\'s purpose shows up as a badge field when listing courses', async () => {
    const { learningService } = installGeminiStub();
    const result = await learningService.generateCourse(A.id, {
      courseName: `${TAG} Mastery Course`, purpose: 'mastery',
    });
    subjectIds.push(result.subjectId);

    const subjects = await learningService.listSubjects(A.id);
    const found = subjects.find((s) => s.id === result.subjectId);
    assert.equal(found.purpose, 'mastery');
  });

  await t.test('a legacy course (no stored options) generates a lesson with zero course-options prompt text', async () => {
    const legacy = await makeLegacyCourse(A.id);
    subjectIds.push(legacy.subjectId);

    const { learningService, calls } = installGeminiStub();
    const detail = await learningService.getLesson(A.id, legacy.lessonId);
    assert.ok(detail.lesson.content);

    const lessonInstruction = systemInstructionOf(calls, /single, focused college lesson/);
    // None of the purpose/focus guidance phrases leak in for a legacy course.
    assert.doesNotMatch(lessonInstruction, /from scratch|board exam|NLE|case scenarios|catching up|clinical/i);
  });

  await t.test('a lesson under a course with options reflects purpose + focus in its own generation prompt', async () => {
    const { learningService: ls1 } = installGeminiStub();
    const result = await ls1.generateCourse(A.id, {
      courseName: `${TAG} NLE Lesson Course`, purpose: 'board_exam', focus: ['case_scenarios'],
    });
    subjectIds.push(result.subjectId);

    const [lessonRow] = await db.query(
      'SELECT l.id FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN modules m ON m.id=t.module_id WHERE m.subject_id = ? LIMIT 1',
      [result.subjectId]
    );

    const { learningService: ls2, calls } = installGeminiStub();
    const detail = await ls2.getLesson(A.id, lessonRow.id);
    assert.ok(detail.lesson.content);

    const lessonInstruction = systemInstructionOf(calls, /single, focused college lesson/);
    assert.match(lessonInstruction, /NLE/);
    assert.match(lessonInstruction, /case scenarios|patient cases/i);
    // Length guidance is roadmap-only — never leaks into a lesson prompt.
    assert.doesNotMatch(lessonInstruction, /modules total/);
  });

});
