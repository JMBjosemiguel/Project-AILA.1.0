'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { formatQuizForTake, formatAttemptReview } = require('../../src/services/quizService');

const quiz = {
  id: 7,
  topic: 'Photosynthesis',
  quiz_type: 'multiple_choice',
  difficulty: 'medium',
  questions: [
    { id: 11, question: 'Where does it happen?', options: ['Chloroplast', 'Mitochondria'], correct_answer: 'Chloroplast', explanation: 'Chloroplasts contain chlorophyll.', order_index: 0 },
    { id: 12, question: 'Gas released?', options: ['O2', 'CO2'], correct_answer: 'O2', explanation: 'Water is split, releasing oxygen.', order_index: 1 },
  ],
};

const ANSWER_KEY_FIELDS = /correct_?answer|correctAnswer|explanation|is_?correct|isCorrect/i;

test('formatQuizForTake exposes no answer key', () => {
  const take = formatQuizForTake(quiz);
  assert.equal(take.id, 7);
  assert.equal(take.items.length, 2);
  assert.deepEqual(Object.keys(take.items[0]).sort(), ['id', 'options', 'orderIndex', 'question']);

  const serialized = JSON.stringify(take);
  assert.doesNotMatch(serialized, ANSWER_KEY_FIELDS, 'take payload must not carry any answer-key field');
  assert.doesNotMatch(serialized, /Chloroplast.*correct|Chlorophyll/i);
});

test('formatAttemptReview carries the grade, the correct answers and explanations', () => {
  const gradedAnswers = [
    { questionId: 11, selectedAnswer: 'Mitochondria', isCorrect: false },
    { questionId: 12, selectedAnswer: 'O2', isCorrect: true },
  ];
  const review = formatAttemptReview({ quiz, attemptId: 99, gradedAnswers, score: 1, total: 2, xpAwarded: 10 });

  assert.equal(review.attemptId, 99);
  assert.equal(review.score, 1);
  assert.equal(review.total, 2);
  assert.equal(review.xpAwarded, 10);

  assert.equal(review.items[0].yourAnswer, 'Mitochondria');
  assert.equal(review.items[0].correctAnswer, 'Chloroplast');
  assert.equal(review.items[0].explanation, 'Chloroplasts contain chlorophyll.');
  assert.equal(review.items[0].isCorrect, false);
  assert.equal(review.items[1].isCorrect, true);
});

test('formatAttemptReview defaults xpAwarded to 0', () => {
  const review = formatAttemptReview({ quiz, attemptId: 1, gradedAnswers: [], score: 0, total: 2 });
  assert.equal(review.xpAwarded, 0);
});
