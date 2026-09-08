const { query, execute } = require('../config/database');

// --- share rows ----------------------------------------------------------

async function findActiveShareByMaterial(materialType, materialId, createdBy) {
  const rows = await query(
    `SELECT id, material_type, material_id, created_by, token_hint, created_at
       FROM material_shares
      WHERE material_type = ? AND material_id = ? AND created_by = ? AND revoked_at IS NULL
      ORDER BY id DESC LIMIT 1`,
    [materialType, materialId, createdBy]
  );
  return rows[0] || null;
}

// Resolve an incoming token (already hashed) to its active share, or null.
async function findActiveShareByHash(tokenHash) {
  const rows = await query(
    `SELECT id, material_type, material_id, created_by, created_at
       FROM material_shares
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function revokeActiveShares(materialType, materialId, createdBy, connection = null) {
  await execute(
    connection,
    `UPDATE material_shares SET revoked_at = CURRENT_TIMESTAMP
      WHERE material_type = ? AND material_id = ? AND created_by = ? AND revoked_at IS NULL`,
    [materialType, materialId, createdBy]
  );
}

// Belt-and-suspenders when a course (and its assessment quizzes) is deleted.
async function revokeSharesForSubject(subjectId, connection = null) {
  await execute(
    connection,
    `UPDATE material_shares ms
       LEFT JOIN quizzes q ON ms.material_type = 'quiz' AND q.id = ms.material_id
        SET ms.revoked_at = CURRENT_TIMESTAMP
      WHERE ms.revoked_at IS NULL
        AND ( (ms.material_type = 'subject' AND ms.material_id = ?)
           OR (ms.material_type = 'quiz' AND q.subject_id = ?) )`,
    [subjectId, subjectId]
  );
}

async function createShareRow({ materialType, materialId, createdBy, tokenHash, tokenHint }, connection = null) {
  const result = await execute(
    connection,
    `INSERT INTO material_shares (material_type, material_id, created_by, token_hash, token_hint)
     VALUES (?, ?, ?, ?, ?)`,
    [materialType, materialId, createdBy, tokenHash, tokenHint]
  );
  return result.insertId;
}

// --- material loaders (share-view: current row, ownership + soft-delete aware) --

// A course + its full tree, only if it currently exists (not soft-deleted).
async function getSubjectTreeForShare(subjectId) {
  const subjectRows = await query(
    `SELECT s.id, s.name, s.difficulty, s.goal, s.visibility, s.created_by,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name
       FROM subjects s
       LEFT JOIN users u ON u.id = s.created_by
      WHERE s.id = ? AND s.deleted_at IS NULL
      LIMIT 1`,
    [subjectId]
  );
  const subject = subjectRows[0];
  if (!subject) return null;

  const rows = await query(
    `SELECT m.id AS module_id, m.title AS module_title, m.order_index AS module_order,
            t.id AS topic_id, t.title AS topic_title, t.order_index AS topic_order,
            l.id AS lesson_id, l.title AS lesson_title, l.content AS lesson_content,
            l.difficulty AS lesson_difficulty, l.estimated_minutes AS lesson_minutes
       FROM modules m
       LEFT JOIN topics t ON t.module_id = m.id AND t.deleted_at IS NULL
       LEFT JOIN lessons l ON l.topic_id = t.id AND l.deleted_at IS NULL
      WHERE m.subject_id = ? AND m.deleted_at IS NULL
      ORDER BY m.order_index ASC, t.order_index ASC, l.id ASC`,
    [subjectId]
  );

  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))];
  const [definitions, examples] = topicIds.length
    ? await Promise.all([
        query(`SELECT topic_id, term, definition_text FROM definitions WHERE topic_id IN (${topicIds.map(() => '?').join(',')}) ORDER BY id ASC`, topicIds),
        query(`SELECT topic_id, title, content FROM examples WHERE topic_id IN (${topicIds.map(() => '?').join(',')}) ORDER BY id ASC`, topicIds),
      ])
    : [[], []];

  const hasAssessments = (await query(
    "SELECT 1 FROM quizzes WHERE subject_id = ? AND assessment_kind <> 'practice' LIMIT 1",
    [subjectId]
  )).length > 0;

  return { subject, rows, definitions, examples, hasAssessments };
}

// A standalone quiz + questions (with the answer key — the serializer strips it).
async function getQuizForShare(quizId) {
  const quizRows = await query(
    `SELECT q.id, q.topic, q.quiz_type, q.difficulty, q.visibility, q.assessment_kind, q.user_id,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name
       FROM quizzes q
       LEFT JOIN users u ON u.id = q.user_id
      WHERE q.id = ?
      LIMIT 1`,
    [quizId]
  );
  const quiz = quizRows[0];
  if (!quiz) return null;

  const questions = await query(
    'SELECT id, question, options, correct_answer, explanation, order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
    [quizId]
  );
  quiz.questions = questions.map((qq) => ({
    ...qq,
    options: qq.options ? (typeof qq.options === 'string' ? JSON.parse(qq.options) : qq.options) : null,
  }));
  return quiz;
}

// --- ownership checks for the create/revoke endpoints -------------------

async function subjectOwnedBy(subjectId, userId) {
  const rows = await query(
    'SELECT id, visibility FROM subjects WHERE id = ? AND created_by = ? AND deleted_at IS NULL LIMIT 1',
    [subjectId, userId]
  );
  return rows[0] || null;
}

async function quizOwnedBy(quizId, userId) {
  const rows = await query(
    'SELECT id, visibility, assessment_kind FROM quizzes WHERE id = ? AND user_id = ? LIMIT 1',
    [quizId, userId]
  );
  return rows[0] || null;
}

async function setSubjectVisibility(subjectId, visibility, connection = null) {
  await execute(connection, 'UPDATE subjects SET visibility = ? WHERE id = ?', [visibility, subjectId]);
}

async function setQuizVisibility(quizId, visibility, connection = null) {
  await execute(connection, 'UPDATE quizzes SET visibility = ? WHERE id = ?', [visibility, quizId]);
}

module.exports = {
  findActiveShareByMaterial,
  findActiveShareByHash,
  revokeActiveShares,
  revokeSharesForSubject,
  createShareRow,
  getSubjectTreeForShare,
  getQuizForShare,
  subjectOwnedBy,
  quizOwnedBy,
  setSubjectVisibility,
  setQuizVisibility,
};
