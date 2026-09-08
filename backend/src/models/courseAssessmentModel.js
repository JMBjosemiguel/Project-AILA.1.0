const { query } = require('../config/database');

// The final assessment always sits in slot 0 (module ids start at 1), a
// checkpoint sits in the slot equal to its module id — see migration 004.
const FINAL_SLOT = 0;

// --- Ownership --------------------------------------------------------------

async function getCourseForUser(subjectId, userId) {
  const rows = await query(
    'SELECT id, name, goal, difficulty FROM subjects WHERE id = ? AND created_by = ? AND deleted_at IS NULL LIMIT 1',
    [subjectId, userId]
  );
  return rows[0] || null;
}

async function getModuleForUser(subjectId, moduleId, userId) {
  const rows = await query(
    `SELECT m.id, m.title, m.subject_id, m.order_index
       FROM modules m
       INNER JOIN subjects s ON s.id = m.subject_id
      WHERE m.id = ? AND m.subject_id = ? AND s.created_by = ?
        AND m.deleted_at IS NULL AND s.deleted_at IS NULL
      LIMIT 1`,
    [moduleId, subjectId, userId]
  );
  return rows[0] || null;
}

// --- Course structure / generation source summaries -----------------------

async function getCourseModules(subjectId) {
  return query(
    'SELECT id, title, order_index FROM modules WHERE subject_id = ? AND deleted_at IS NULL ORDER BY order_index ASC, id ASC',
    [subjectId]
  );
}

// A concise outline for one module: topic titles + lesson titles (NOT bodies).
async function getModuleOutline(moduleId) {
  const rows = await query(
    `SELECT t.id AS topic_id, t.title AS topic_title, l.id AS lesson_id, l.title AS lesson_title
       FROM topics t
       LEFT JOIN lessons l ON l.topic_id = t.id AND l.deleted_at IS NULL
      WHERE t.module_id = ? AND t.deleted_at IS NULL
      ORDER BY t.order_index ASC, l.id ASC`,
    [moduleId]
  );
  const topics = new Map();
  for (const row of rows) {
    if (!topics.has(row.topic_id)) topics.set(row.topic_id, { title: row.topic_title, lessons: [] });
    if (row.lesson_id) topics.get(row.topic_id).lessons.push(row.lesson_title);
  }
  return [...topics.values()];
}

// A concise outline for the whole course: module -> topic titles.
async function getCourseOutline(subjectId) {
  const rows = await query(
    `SELECT m.id AS module_id, m.title AS module_title, t.title AS topic_title
       FROM modules m
       LEFT JOIN topics t ON t.module_id = m.id AND t.deleted_at IS NULL
      WHERE m.subject_id = ? AND m.deleted_at IS NULL
      ORDER BY m.order_index ASC, t.order_index ASC`,
    [subjectId]
  );
  const modules = new Map();
  for (const row of rows) {
    if (!modules.has(row.module_id)) modules.set(row.module_id, { moduleId: row.module_id, title: row.module_title, topics: [] });
    if (row.topic_title) modules.get(row.module_id).topics.push(row.topic_title);
  }
  return [...modules.values()];
}

// --- Content-completion (unlock gating) ----------------------------------

// A module's *learning content* is complete when every one of its lesson-
// bearing topics is at learning_progress.status = 'completed'. A module with no
// lessons at all is treated as complete (nothing to gate on).
async function getModuleContentStatus(moduleId, userId) {
  const rows = await query(
    `SELECT t.id AS topic_id, lp.status,
            (SELECT COUNT(*) FROM lessons l WHERE l.topic_id = t.id AND l.deleted_at IS NULL) AS lesson_count
       FROM topics t
       LEFT JOIN learning_progress lp ON lp.topic_id = t.id AND lp.user_id = ?
      WHERE t.module_id = ? AND t.deleted_at IS NULL`,
    [userId, moduleId]
  );
  const gating = rows.filter((r) => Number(r.lesson_count) > 0);
  const completed = gating.filter((r) => r.status === 'completed').length;
  return {
    totalTopics: gating.length,
    completedTopics: completed,
    contentCompleted: gating.length === 0 ? true : completed === gating.length,
  };
}

// --- Assessment quiz lookup / attempts -----------------------------------

async function findAssessmentQuiz(userId, subjectId, assessmentSlot) {
  const rows = await query(
    `SELECT id, topic, assessment_kind, passing_score, module_id, subject_id, item_count
       FROM quizzes
      WHERE user_id = ? AND subject_id = ? AND assessment_slot = ?
      LIMIT 1`,
    [userId, subjectId, assessmentSlot]
  );
  return rows[0] || null;
}

async function listCourseAssessmentQuizzes(userId, subjectId) {
  return query(
    `SELECT id, topic, assessment_kind, passing_score, module_id, assessment_slot, item_count
       FROM quizzes
      WHERE user_id = ? AND subject_id = ? AND assessment_kind <> 'practice'`,
    [userId, subjectId]
  );
}

// Every attempt on one assessment quiz, newest first, plus the derived
// pass-history (a pass anywhere makes the assessment passed).
async function getAssessmentAttempts(userId, quizId) {
  const rows = await query(
    `SELECT id, status, score, total, passed, started_at, completed_at, updated_at
       FROM quiz_attempts
      WHERE user_id = ? AND quiz_id = ?
      ORDER BY COALESCE(completed_at, updated_at, started_at) DESC, id DESC`,
    [userId, quizId]
  );
  return rows;
}

module.exports = {
  FINAL_SLOT,
  getCourseForUser,
  getModuleForUser,
  getCourseModules,
  getModuleOutline,
  getCourseOutline,
  getModuleContentStatus,
  findAssessmentQuiz,
  listCourseAssessmentQuizzes,
  getAssessmentAttempts,
};
