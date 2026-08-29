const { query, execute } = require('../config/database');

async function createQuiz({ userId, topic, quizType, difficulty, sourceType, sourceId, items }, connection = null) {
  const quizResult = await execute(
    connection,
    `
      INSERT INTO quizzes (user_id, topic, quiz_type, difficulty, source_type, source_id, item_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [userId, topic, quizType, difficulty, sourceType || null, sourceId || null, items.length]
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

async function getQuizWithQuestions(quizId, userId) {
  const quizRows = await query(
    'SELECT id, user_id, topic, quiz_type, difficulty, item_count, created_at FROM quizzes WHERE id = ? AND user_id = ? LIMIT 1',
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

async function createAttempt({ quizId, userId, score, total }, connection = null) {
  const result = await execute(
    connection,
    'INSERT INTO quiz_attempts (quiz_id, user_id, score, total, completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [quizId, userId, score, total]
  );
  return result.insertId;
}

async function createAttemptAnswers(attemptId, answers, connection = null) {
  if (!answers.length) return;

  const placeholders = answers.map(() => '(?, ?, ?, ?)').join(', ');
  const params = answers.flatMap((answer) => [attemptId, answer.questionId, answer.selectedAnswer, answer.isCorrect ? 1 : 0]);

  await execute(
    connection,
    `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_answer, is_correct) VALUES ${placeholders}`,
    params
  );
}

async function listAttemptsForUser(userId, limit = 10) {
  return query(
    `
      SELECT qa.id, qa.quiz_id, qa.score, qa.total, qa.completed_at, q.topic, q.quiz_type, q.difficulty
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ?
      ORDER BY qa.completed_at DESC
      LIMIT ?
    `,
    [userId, Number(limit)]
  );
}

async function getAttemptDetail(attemptId, userId) {
  const attemptRows = await query(
    `
      SELECT qa.id, qa.quiz_id, qa.score, qa.total, qa.completed_at, q.topic, q.quiz_type
      FROM quiz_attempts qa
      INNER JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.id = ? AND qa.user_id = ?
      LIMIT 1
    `,
    [attemptId, userId]
  );
  const attempt = attemptRows[0];
  if (!attempt) return null;

  const answers = await query(
    `
      SELECT qaa.question_id, qaa.selected_answer, qaa.is_correct, qq.question, qq.correct_answer, qq.explanation, qq.order_index
      FROM quiz_attempt_answers qaa
      INNER JOIN quiz_questions qq ON qq.id = qaa.question_id
      WHERE qaa.attempt_id = ?
      ORDER BY qq.order_index ASC
    `,
    [attemptId]
  );

  return { ...attempt, answers };
}

async function getQuizAverageScore(userId) {
  const rows = await query(
    `
      SELECT ROUND(AVG(score / total) * 100, 0) AS avg_percent, COUNT(*) AS attempt_count
      FROM quiz_attempts
      WHERE user_id = ? AND total > 0
    `,
    [userId]
  );
  return rows[0] || { avg_percent: null, attempt_count: 0 };
}

async function deleteAttemptForUser(attemptId, userId) {
  const result = await query('DELETE FROM quiz_attempts WHERE id = ? AND user_id = ?', [attemptId, userId]);
  return result.affectedRows;
}

module.exports = {
  createQuiz,
  getQuizWithQuestions,
  createAttempt,
  createAttemptAnswers,
  listAttemptsForUser,
  getAttemptDetail,
  getQuizAverageScore,
  deleteAttemptForUser,
};
