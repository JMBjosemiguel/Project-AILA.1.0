const { execute } = require('../config/database');

/**
 * Deep-copy a course tree into a new private course owned by `recipientId`.
 * Copies STRUCTURE + CONTENT only:
 *   subjects -> modules -> topics -> lessons  (+ per-topic definitions, examples)
 * Never copies: the source owner's learning_progress / lesson_progress /
 * quiz_attempts, any generated assessment quiz rows (the recipient generates
 * their own personalized checkpoints/final on demand — Batch 4), resource links,
 * `code` (UNIQUE), or `personalization_context` (that snapshot described why the
 * ORIGINAL was generated — cleared to NULL on the copy).
 *
 * Runs inside the caller's transaction connection.
 */
async function copySubjectTree(sourceSubjectId, recipientId, connection) {
  const srcRows = await execute(
    connection,
    'SELECT name, description, difficulty, goal, is_ai_generated FROM subjects WHERE id = ? LIMIT 1',
    [sourceSubjectId]
  );
  const src = srcRows[0];
  if (!src) return null;

  const subjectResult = await execute(
    connection,
    `INSERT INTO subjects
       (created_by, name, code, description, difficulty, goal, is_ai_generated,
        personalization_context, visibility, copied_from_subject_id)
     VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, 'private', ?)`,
    [recipientId, src.name, src.description, src.difficulty, src.goal, src.is_ai_generated, sourceSubjectId]
  );
  const newSubjectId = subjectResult.insertId;

  const modules = await execute(
    connection,
    'SELECT id, title, order_index FROM modules WHERE subject_id = ? AND deleted_at IS NULL ORDER BY order_index ASC, id ASC',
    [sourceSubjectId]
  );

  for (const module_ of modules) {
    const moduleResult = await execute(
      connection,
      'INSERT INTO modules (subject_id, title, order_index) VALUES (?, ?, ?)',
      [newSubjectId, module_.title, module_.order_index]
    );
    const newModuleId = moduleResult.insertId;

    const topics = await execute(
      connection,
      'SELECT id, title, order_index FROM topics WHERE module_id = ? AND deleted_at IS NULL ORDER BY order_index ASC, id ASC',
      [module_.id]
    );

    for (const topic of topics) {
      const topicResult = await execute(
        connection,
        'INSERT INTO topics (module_id, title, order_index) VALUES (?, ?, ?)',
        [newModuleId, topic.title, topic.order_index]
      );
      const newTopicId = topicResult.insertId;

      await execute(
        connection,
        `INSERT INTO lessons (topic_id, title, content, difficulty, estimated_minutes, personalization_context)
         SELECT ?, title, content, difficulty, estimated_minutes, NULL
           FROM lessons WHERE topic_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
        [newTopicId, topic.id]
      );
      await execute(
        connection,
        'INSERT INTO definitions (topic_id, term, definition_text) SELECT ?, term, definition_text FROM definitions WHERE topic_id = ?',
        [newTopicId, topic.id]
      );
      await execute(
        connection,
        'INSERT INTO examples (topic_id, title, content) SELECT ?, title, content FROM examples WHERE topic_id = ?',
        [newTopicId, topic.id]
      );
    }
  }

  return newSubjectId;
}

/**
 * Copy a standalone quiz into a new private practice quiz owned by `recipientId`.
 * Questions are copied WITH the answer key (the recipient must be graded
 * server-side) — the API never returns it. Never a formal assessment, no
 * attempts, personalization_context cleared.
 */
async function copyQuiz(sourceQuizId, recipientId, connection) {
  const srcRows = await execute(
    connection,
    'SELECT topic, quiz_type, difficulty, item_count FROM quizzes WHERE id = ? LIMIT 1',
    [sourceQuizId]
  );
  const src = srcRows[0];
  if (!src) return null;

  const quizResult = await execute(
    connection,
    `INSERT INTO quizzes
       (user_id, topic, quiz_type, difficulty, item_count, personalization_context,
        subject_id, module_id, assessment_kind, passing_score, assessment_slot,
        visibility, copied_from_quiz_id)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'practice', NULL, NULL, 'private', ?)`,
    [recipientId, src.topic, src.quiz_type, src.difficulty, src.item_count, sourceQuizId]
  );
  const newQuizId = quizResult.insertId;

  await execute(
    connection,
    `INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, order_index)
     SELECT ?, question, options, correct_answer, explanation, order_index
       FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC`,
    [newQuizId, sourceQuizId]
  );

  return newQuizId;
}

module.exports = { copySubjectTree, copyQuiz };
