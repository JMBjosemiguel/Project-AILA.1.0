const ApiError = require('../utils/ApiError');
const { callGemini, getResponseText } = require('./geminiClient');
const { transaction } = require('../config/database');
const quizModel = require('../models/quizModel');
const resourceModel = require('../models/resourceModel');
const { awardXp, logActivity } = require('../utils/gamification');
const { notifyUser } = require('../utils/notify');
const { truncateForAi } = require('../utils/pdfText');

const QUIZ_TYPE_LABELS = {
  multiple_choice: 'multiple choice',
  true_false: 'true or false',
  identification: 'identification',
};

const QUIZ_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    correctAnswer: { type: 'STRING' },
    explanation: { type: 'STRING' },
  },
  required: ['question', 'correctAnswer', 'explanation'],
};

const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    quizType: { type: 'STRING' },
    items: { type: 'ARRAY', items: QUIZ_ITEM_SCHEMA },
  },
  required: ['topic', 'quizType', 'items'],
};

const FLASHCARDS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          answer: { type: 'STRING' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['topic', 'cards'],
};

function parseJsonResponse(payload, errorMessage) {
  const text = getResponseText(payload);

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, errorMessage);
  }
}

const DIFFICULTY_LABELS = {
  easy: 'beginner-friendly, straightforward',
  medium: 'intermediate-level',
  hard: 'advanced, challenging',
};

async function generateQuiz({ topic, quizType, itemCount, difficulty = 'medium', sourceText = null }) {
  const typeLabel = QUIZ_TYPE_LABELS[quizType] || QUIZ_TYPE_LABELS.multiple_choice;
  const difficultyLabel = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.medium;

  const instructions = {
    multiple_choice: 'Each item must have exactly 4 plausible "options", and "correctAnswer" must exactly match one of the options.',
    true_false: 'Each item must have "options": ["True", "False"], and "correctAnswer" must be exactly "True" or "False".',
    identification: 'Each item must omit "options" (or leave it empty) and "correctAnswer" must be the short expected term or phrase.',
  };

  const prompt = [
    sourceText
      ? `Generate a ${itemCount}-item ${difficultyLabel} ${typeLabel} quiz based ONLY on the following document content (topic: "${topic}"). Base every question on facts actually present in the document.`
      : `Generate a ${itemCount}-item ${difficultyLabel} ${typeLabel} quiz about "${topic}" for a college student.`,
    instructions[quizType] || instructions.multiple_choice,
    'Keep each "explanation" short (one sentence) and educational, not just restating the answer.',
    'Do not include any text outside the JSON object.',
    sourceText ? `\n\nDocument content:\n${truncateForAi(sourceText, 10000)}` : '',
  ].join(' ');

  const payload = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: QUIZ_SCHEMA,
    },
  });

  const result = parseJsonResponse(payload, 'AILA could not generate that quiz. Please try again.');

  return {
    topic: result.topic || topic,
    quizType,
    items: Array.isArray(result.items) ? result.items : [],
  };
}

async function generateFlashcards({ topic, count }) {
  const prompt = [
    `Generate ${count} question-and-answer flashcards about "${topic}" for a college student.`,
    'Keep each question focused on a single concept and each answer concise (1-2 sentences).',
    'Do not include any text outside the JSON object.',
  ].join(' ');

  const payload = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: FLASHCARDS_SCHEMA,
    },
  });

  const result = parseJsonResponse(payload, 'AILA could not generate those flashcards. Please try again.');

  return {
    topic: result.topic || topic,
    cards: Array.isArray(result.cards) ? result.cards : [],
  };
}

function normalizeAnswer(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

function formatQuizForClient(quiz) {
  return {
    id: quiz.id,
    topic: quiz.topic,
    quizType: quiz.quiz_type,
    difficulty: quiz.difficulty,
    items: quiz.questions.map((question) => ({
      id: question.id,
      question: question.question,
      options: question.options,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
    })),
  };
}

async function generateAndSaveQuiz({ userId, topic, quizType, itemCount, difficulty = 'medium', sourceType, sourceId }) {
  let sourceText = null;
  if (sourceType === 'resource' && sourceId) {
    sourceText = await resourceModel.getExtractedText(sourceId, userId).catch(() => null);
  }

  const generated = await generateQuiz({ topic, quizType, itemCount, difficulty, sourceText });

  if (!generated.items.length) {
    throw new ApiError(502, 'AILA could not generate that quiz. Please try again.');
  }

  const quizId = await quizModel.createQuiz({
    userId,
    topic: generated.topic,
    quizType,
    difficulty,
    sourceType,
    sourceId,
    items: generated.items,
  });

  const quiz = await quizModel.getQuizWithQuestions(quizId, userId);

  await notifyUser(userId, {
    type: 'system',
    title: 'Quiz ready',
    body: `AILA generated a ${generated.items.length}-item quiz on "${quiz.topic}".`,
  });

  return formatQuizForClient(quiz);
}

async function getQuizForUser(userId, quizId) {
  const quiz = await quizModel.getQuizWithQuestions(Number(quizId), userId);
  if (!quiz) {
    throw new ApiError(404, 'Quiz not found.');
  }
  return formatQuizForClient(quiz);
}

async function submitAttempt(userId, quizId, answers) {
  const quiz = await quizModel.getQuizWithQuestions(Number(quizId), userId);
  if (!quiz) {
    throw new ApiError(404, 'Quiz not found.');
  }

  const answerMap = new Map(answers.map((answer) => [Number(answer.questionId), answer.selectedAnswer]));

  const gradedAnswers = quiz.questions.map((question) => {
    const selectedAnswer = answerMap.get(question.id) ?? '';
    const isCorrect = normalizeAnswer(selectedAnswer) === normalizeAnswer(question.correct_answer);
    return { questionId: question.id, selectedAnswer, isCorrect };
  });

  const score = gradedAnswers.filter((answer) => answer.isCorrect).length;
  const total = quiz.questions.length;

  const attemptId = await transaction(async (connection) => {
    const newAttemptId = await quizModel.createAttempt({ quizId: quiz.id, userId, score, total }, connection);
    await quizModel.createAttemptAnswers(newAttemptId, gradedAnswers, connection);
    await logActivity(userId, 'quiz_completed', quiz.id, `Scored ${score}/${total} on "${quiz.topic}" quiz`, connection);

    const xpEarned = Math.round((score / total) * 20);
    if (xpEarned > 0) {
      await awardXp(userId, xpEarned, `Scored ${score}/${total} on "${quiz.topic}" quiz`, connection);
    }
    await notifyUser(userId, {
      type: 'system',
      title: 'Quiz scored',
      body: `You scored ${score}/${total} on the "${quiz.topic}" quiz.`,
      connection,
    });

    return newAttemptId;
  });

  return {
    attemptId,
    score,
    total,
    results: gradedAnswers,
  };
}

async function listQuizHistory(userId) {
  return quizModel.listAttemptsForUser(userId);
}

async function getAttemptReview(userId, attemptId) {
  const attempt = await quizModel.getAttemptDetail(Number(attemptId), userId);
  if (!attempt) {
    throw new ApiError(404, 'Quiz attempt not found.');
  }
  return attempt;
}

async function deleteAttempt(userId, attemptId) {
  const affectedRows = await quizModel.deleteAttemptForUser(Number(attemptId), userId);
  if (!affectedRows) {
    throw new ApiError(404, 'Quiz attempt not found.');
  }
}

module.exports = {
  generateQuiz,
  generateFlashcards,
  generateAndSaveQuiz,
  getQuizForUser,
  submitAttempt,
  listQuizHistory,
  getAttemptReview,
  deleteAttempt,
};
