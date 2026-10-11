const { query, execute, transaction } = require('../config/database');

async function createQuiz({
  userId, topic, quizType, difficulty, sourceType, sourceId, items, personalizationContext = null,
  subjectId = null, moduleId = null, assessmentKind = 'practice', passingScore = null, assessmentSlot = null,
  sourceChatMessageId = null,
}, connection = null) {
  const quizResult = await execute(
    connection,
    `
      INSERT INTO quizzes
        (user_id, topic, quiz_type, difficulty, source_type, source_id, source_chat_message_id, item_count,
         personalization_context, subject_id, module_id, assessment_kind, passing_score, assessment_slot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId, topic, quizType, difficulty, sourceType || null, sourceId || null, sourceChatMessageId || null, items.length,
      personalizationContext || null, subjectId, moduleId, assessmentKind, passingScore, assessmentSlot,
    ]
  );

  const quizId = quizResult.insertId;

  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = items.flatMap((item, index) => [
    quizId,
    item.question,
    item.options?.length ? JSON.stringify(item.options) : null,
    item.correctAnswer,
    item.explanation || null,
    index,
  ]);

  await execute(
    connection,
    `INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES ${placeholders}`,
    params
  );

  return quizId;
}

// Looks up exactly one question (and confirms it belongs to this quiz via the
// WHERE, instead of fetching every question in the quiz just to .find() one).
// Used by the answer-autosave path, which only ever needs one question's
// options to validate the submitted answer.
// --- Batched generation (practice quizzes above the single-call item count) -
//
// A quiz created here starts with ZERO quiz_questions rows and item_count set
// to the TARGET the student asked for — not the actual count yet. Batches
// append real rows via appendQuizQuestions; finalizeQuizItemCount corrects
// item_count to match reality once generation is done (or abandoned and
// self-healed on first use — see quizService.startAttempt). No schema change:
// this is the same `quizzes`/`quiz_questions` shape createQuiz already uses,
// just populated incrementally instead of all at once.

async function createQuizShell({
  userId, topic, quizType, difficulty, sourceType, sourceId, targetCount, personalizationContext = null,
}) {
  const result = await execute(
    null,
    `
      INSERT INTO quizzes
        (user_id, topic, quiz_type, difficulty, source_type, source_id, item_count, personalization_context, assessment_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'practice')
    `,
    [userId, topic, quizType, difficulty, sourceType || null, sourceId || null, targetCount, personalizationContext || null]
  );
  return result.insertId;
}

// Everything the batch/finish endpoints need to validate a request, in one
// round-trip: ownership, the generation target, how many questions are
// actually saved so far, and whether an attempt already exists (generation
// is only ever allowed before the first attempt starts).
async function getQuizGenerationState(quizId, userId) {
  const rows = await query(
    'SELECT id, user_id, topic, quiz_type, difficulty, item_count, personalization_context FROM quizzes WHERE id = ? LIMIT 1',
    [quizId]
  );
  const quiz = rows[0];
  if (!quiz) return null;

  const [{ actual }] = await query('SELECT COUNT(*) AS actual FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  const [{ hasAttempt }] = await query('SELECT EXISTS(SELECT 1 FROM quiz_attempts WHERE quiz_id = ?) AS hasAttempt', [quizId]);

  return {
    ...quiz,
    isOwner: Number(quiz.user_id) === Number(userId),
    target: Number(quiz.item_count),
    actual: Number(actual),
    hasAttempt: Boolean(hasAttempt),
  };
}

// Dedupe keys (see quizService.questionDedupeKey) for every question already
// saved for this quiz, so a batch can be checked against the WHOLE quiz so
// far, not just against itself.
async function getQuestionStemsForQuiz(quizId) {
  const rows = await query('SELECT question FROM quiz_questions WHERE quiz_id = ?', [quizId]);
  return rows.map((row) => row.question);
}

// Concurrency-safe append: FOR UPDATE on the quiz row serializes concurrent
// batch calls for the SAME quiz (the frontend runs up to 3 at once), so two
// transactions racing to append can never compute the same order_index —
// the second one's lock acquisition blocks until the first commits, then it
// re-reads MAX(order_index) and sees the first batch's rows.
async function appendQuizQuestions(quizId, items) {
  return transaction(async (connection) => {
    await execute(connection, 'SELECT id FROM quizzes WHERE id = ? FOR UPDATE', [quizId]);

    if (items.length) {
      const [{ nextIndex }] = await execute(
        connection,
        'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM quiz_questions WHERE quiz_id = ?',
        [quizId]
      );
      const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const params = items.flatMap((item, index) => [
        quizId,
        item.question,
        item.options?.length ? JSON.stringify(item.options) : null,
        item.correctAnswer,
        item.explanation || null,
        Number(nextIndex) + index,
      ]);
      await execute(
        connection,
        `INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index) VALUES ${placeholders}`,
        params
      );
    }

    const [{ total }] = await execute(connection, 'SELECT COUNT(*) AS total FROM quiz_questions WHERE quiz_id = ?', [quizId]);
    return Number(total);
  });
}

// Corrects item_count to the real, current question count — called when
// generation finishes naturally (target reached), when a student accepts a
// short result early ("Use these N"), and as a self-heal the first time
// anyone tries to start an attempt on a quiz whose item_count still disagrees
// with reality (an abandoned generation nobody ever explicitly finished).
async function finalizeQuizItemCount(quizId) {
  return transaction(async (connection) => {
    const [{ item_count: target }] = await execute(connection, 'SELECT item_count FROM quizzes WHERE id = ? FOR UPDATE', [quizId]);
    const [{ actual }] = await execute(connection, 'SELECT COUNT(*) AS actual FROM quiz_questions WHERE quiz_id = ?', [quizId]);
    await execute(connection, 'UPDATE quizzes SET item_count = ? WHERE id = ?', [actual, quizId]);
    return { target: Number(target), actual: Number(actual) };
  });
}

async function getQuestionForQuiz(quizId, questionId, connection = null) {
  const rows = await execute(
    connection,
    'SELECT id, question, options, correct_answer, explanation, order_index FROM quiz_questions WHERE id = ? AND quiz_id = ? LIMIT 1',
    [questionId, quizId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    options: row.options ? (typeof row.options === 'string' ? JSON.parse(row.options) : row.options) : null,
  };
}

async function getQuizWithQuestions(quizId, userId) {
  const quizRows = await query(
    `SELECT id, user_id, topic, quiz_type, difficulty, item_count, personalization_context, created_at,
            subject_id, module_id, assessment_kind, passing_score, assessment_slot
       FROM quizzes WHERE id = ? AND user_id = ? LIMIT 1`,
    [quizId, userId]
  );
  const quiz = quizRows[0];
  if (!quiz) return null;

  const questions = await query(
    'SELECT id, question, options, correct_answer, explanation, order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
    [quizId]
  );

  return {
    ...quiz,
    questions: questions.map((question) => ({
      ...question,
      options: question.options ? (typeof question.options === 'string' ? JSON.parse(question.options) : question.options) : null,
    })),
  };
}

// --- Resumable attempt lifecycle -------------------------------------------

// The single active (in-progress) attempt for a (user, quiz), if one exists.
// UNIQUE(user_id, quiz_id, active_slot) guarantees there is at most one.
async function findActiveAttempt(userId, quizId, connection = null) {
  const rows = await execute(
    connection,
    `SELECT id, quiz_id, user_id, status, current_index, score, total, started_at
       FROM quiz_attempts
      WHERE user_id = ? AND quiz_id = ? AND status = 'in_progress' AND active_slot = 1
      LIMIT 1`,
    [userId, quizId]
  );
  return rows[0] || null;
}

async function createInProgressAttempt({ quizId, userId, total }, connection = null) {
  const result = await execute(
    connection,
    `INSERT INTO quiz_attempts (quiz_id, user_id, score, total, status, current_index, active_slot, started_at, updated_at)
     VALUES (?, ?, 0, ?, 'in_progress', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [quizId, userId, total]
  );
  return result.insertId;
}

async function getAttemptById(attemptId, userId, connection = null) {
  const rows = await execute(
    connection,
    `SELECT qa.id, qa.quiz_id, qa.user_id, qa.status, qa.current_index, qa.score, qa.total, qa.passed,
            qa.started_at, qa.completed_at, qa.updated_at,
            q.topic, q.quiz_type, q.difficulty,
            q.assessment_kind, q.passing_score, q.subject_id, q.module_id
       FROM quiz_attempts qa
       INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.id = ? AND qa.user_id = ?
      LIMIT 1`,
    [attemptId, userId]
  );
  return rows[0] || null;
}

// Row-locking read used inside the submit transaction to serialize concurrent
// submissions of the same attempt.
async function lockAttemptStatus(attemptId, connection) {
  const rows = await execute(
    connection,
    'SELECT status FROM quiz_attempts WHERE id = ? FOR UPDATE',
    [attemptId]
  );
  return rows[0]?.status ?? null;
}

async function getSavedAnswers(attemptId, connection = null) {
  return execute(
    connection,
    'SELECT question_id, selected_answer, is_correct, answered_at FROM quiz_attempt_answers WHERE attempt_id = ?',
    [attemptId]
  );
}

// Idempotent save — changing an answer before submission overwrites the row and
// resets grading (is_correct -> NULL).
async function upsertAttemptAnswer(attemptId, questionId, selectedAnswer, connection = null) {
  await execute(
    connection,
    `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_answer, is_correct, answered_at)
     VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE selected_answer = VALUES(selected_answer), is_correct = NULL, answered_at = CURRENT_TIMESTAMP`,
    [attemptId, questionId, selectedAnswer]
  );
}

async function updateAttemptProgress(attemptId, currentIndex, connection = null) {
  await execute(
    connection,
    'UPDATE quiz_attempts SET current_index = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [currentIndex, attemptId]
  );
}

// Submit-time equivalent of calling an upsert-then-grade pair once per
// question in a loop: same two columns end up holding the same values, just
// as one bulk multi-row statement (mirrors the VALUES-list pattern createQuiz
// already uses) instead of 2*N sequential round-trips.
async function bulkUpsertGradedAnswers(attemptId, gradedAnswers, connection = null) {
  if (!gradedAnswers.length) return;
  const placeholders = gradedAnswers.map(() => '(?, ?, ?, ?, CURRENT_TIMESTAMP)').join(', ');
  const params = gradedAnswers.flatMap((answer) => [
    attemptId,
    answer.questionId,
    answer.selectedAnswer || null,
    answer.isCorrect ? 1 : 0,
  ]);
  await execute(
    connection,
    `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_answer, is_correct, answered_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       selected_answer = VALUES(selected_answer), is_correct = VALUES(is_correct), answered_at = VALUES(answered_at)`,
    params
  );
}

// Finalize only if still in progress — the WHERE guard plus the FOR UPDATE lock
// makes a double submit impossible. Returns the driver result (affectedRows).
async function finalizeAttempt({ attemptId, score, total, currentIndex, passed = null }, connection = null) {
  return execute(
    connection,
    `UPDATE quiz_attempts
        SET status = 'submitted', active_slot = NULL, score = ?, total = ?, current_index = ?, passed = ?,
            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'in_progress'`,
    [score, total, currentIndex, passed === null ? null : (passed ? 1 : 0), attemptId]
  );
}

async function listActiveAttemptsForUser(userId, limit = 10) {
  return query(
    `SELECT qa.id AS attempt_id, qa.quiz_id, qa.current_index, qa.total, qa.started_at, qa.updated_at,
            q.topic, q.quiz_type, q.difficulty, q.item_count, q.assessment_kind,
            (SELECT COUNT(*) FROM quiz_attempt_answers x
              WHERE x.attempt_id = qa.id AND x.selected_answer IS NOT NULL AND x.selected_answer <> '') AS answered
       FROM quiz_attempts qa
       INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? AND qa.status = 'in_progress'
      ORDER BY COALESCE(qa.updated_at, qa.started_at) DESC
      LIMIT ?`,
    [userId, Number(limit)]
  );
}

// --- History / analytics (submitted attempts only) ------------------------

async function listAttemptsForUser(userId, limit = 10) {
  return query(
    `
      SELECT qa.id, qa.quiz_id, qa.score, qa.total, qa.passed, qa.completed_at,
             q.topic, q.quiz_type, q.difficulty, q.assessment_kind, q.passing_score
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? AND qa.status = 'submitted'
      ORDER BY qa.completed_at DESC
      LIMIT ?
    `,
    [userId, Number(limit)]
  );
}

async function getQuizAverageScore(userId) {
  const rows = await query(
    `
      SELECT ROUND(AVG(score / total) * 100, 0) AS avg_percent, COUNT(*) AS attempt_count
      FROM quiz_attempts
      WHERE user_id = ? AND status = 'submitted' AND total > 0
    `,
    [userId]
  );
  return rows[0] || { avg_percent: null, attempt_count: 0 };
}

async function deleteAttemptForUser(attemptId, userId) {
  const result = await query('DELETE FROM quiz_attempts WHERE id = ? AND user_id = ?', [attemptId, userId]);
  return result.affectedRows;
}

// The subject a quiz's source belongs to, so personalization signals can be
// scoped to that course. Only 'lesson' and 'topic' sources map to a subject.
async function getSubjectIdForSource(sourceType, sourceId) {
  if (!sourceId) return null;
  if (sourceType === 'lesson') {
    const rows = await query(
      'SELECT m.subject_id FROM lessons l INNER JOIN topics t ON t.id = l.topic_id INNER JOIN modules m ON m.id = t.module_id WHERE l.id = ? LIMIT 1',
      [sourceId]
    );
    return rows[0]?.subject_id ?? null;
  }
  if (sourceType === 'topic') {
    const rows = await query(
      'SELECT m.subject_id FROM topics t INNER JOIN modules m ON m.id = t.module_id WHERE t.id = ? LIMIT 1',
      [sourceId]
    );
    return rows[0]?.subject_id ?? null;
  }
  return null;
}

// The user's already-saved practice quiz for a given chat message, if any — the
// UNIQUE(user_id, source_chat_message_id) also guards this at the DB level.
async function findQuizIdByChatMessage(userId, chatMessageId) {
  const rows = await query(
    'SELECT id FROM quizzes WHERE user_id = ? AND source_chat_message_id = ? LIMIT 1',
    [userId, chatMessageId]
  );
  return rows[0]?.id ?? null;
}

// Strictly scoped to user_id — a quiz's `visibility`/share link lets someone
// copy it into their own quizzes, but never makes it listable under search.
async function searchQuizzesForUser(userId, searchTerm, limit = 20) {
  return query(
    `SELECT id, topic, quiz_type, difficulty, assessment_kind, subject_id, module_id
       FROM quizzes
      WHERE user_id = ? AND topic LIKE ?
        AND EXISTS (SELECT 1 FROM quiz_questions WHERE quiz_questions.quiz_id = quizzes.id)
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, `%${searchTerm}%`, limit]
  );
}

module.exports = {
  createQuiz,
  findQuizIdByChatMessage,
  searchQuizzesForUser,
  getQuizWithQuestions,
  getQuestionForQuiz,
  createQuizShell,
  getQuizGenerationState,
  getQuestionStemsForQuiz,
  appendQuizQuestions,
  finalizeQuizItemCount,
  findActiveAttempt,
  createInProgressAttempt,
  getAttemptById,
  lockAttemptStatus,
  getSavedAnswers,
  upsertAttemptAnswer,
  updateAttemptProgress,
  bulkUpsertGradedAnswers,
  finalizeAttempt,
  listActiveAttemptsForUser,
  listAttemptsForUser,
  getQuizAverageScore,
  deleteAttemptForUser,
  getSubjectIdForSource,
};
