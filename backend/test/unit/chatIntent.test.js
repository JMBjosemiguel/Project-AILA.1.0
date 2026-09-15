'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_ITEMS,
  mentionsQuiz,
  mentionsFlashcards,
  clampCount,
  normalizeQuizType,
  normalizeDifficulty,
  extractExplicitQuizType,
  extractExplicitItemCount,
  looksLikeTopicAnswer,
  cleanTopic,
} = require('../../src/utils/chatIntent');

test('chatIntent (deterministic helpers)', async (t) => {
  await t.test('mentionsQuiz matches "quiz" and "questions" (the pre-filter gate, not the decision)', () => {
    for (const msg of ['quiz', 'Quiz me', 'a QUIZZES thing', 'give me 10 questions about X', 'Question?']) {
      assert.equal(mentionsQuiz(msg), true, msg);
    }
    for (const msg of ['what is REST?', 'explain encapsulation', '']) {
      assert.equal(mentionsQuiz(msg), false, msg);
    }
  });

  await t.test('mentionsFlashcards matches with/without a space', () => {
    assert.equal(mentionsFlashcards('make flashcards'), true);
    assert.equal(mentionsFlashcards('flash cards please'), true);
    assert.equal(mentionsFlashcards('quiz me'), false);
  });

  await t.test('clampCount enforces the safe maximum and falls back on junk', () => {
    assert.equal(clampCount(5), 5);
    assert.equal(clampCount(999), MAX_ITEMS);
    assert.equal(clampCount(0), 10);
    assert.equal(clampCount(-5), 10);
    assert.equal(clampCount('not a number'), 10);
    assert.equal(clampCount(null, 3), 3);
    assert.equal(clampCount(3.9), 3);
  });

  await t.test('normalizeQuizType only accepts the known set, else null', () => {
    assert.equal(normalizeQuizType('multiple_choice'), 'multiple_choice');
    assert.equal(normalizeQuizType('true_false'), 'true_false');
    assert.equal(normalizeQuizType('identification'), 'identification');
    assert.equal(normalizeQuizType('essay'), null);
    assert.equal(normalizeQuizType(''), null);
    assert.equal(normalizeQuizType(undefined), null);
  });

  await t.test('normalizeDifficulty only accepts easy/medium/hard, else null', () => {
    assert.equal(normalizeDifficulty('hard'), 'hard');
    assert.equal(normalizeDifficulty('impossible'), null);
  });

  await t.test('extractExplicitQuizType reads the type only when actually stated', () => {
    assert.equal(extractExplicitQuizType('a true or false quiz'), 'true_false');
    assert.equal(extractExplicitQuizType('an identification quiz'), 'identification');
    assert.equal(extractExplicitQuizType('a multiple-choice quiz'), 'multiple_choice');
    assert.equal(extractExplicitQuizType('quiz me about SOLID'), null);
  });

  await t.test('extractExplicitItemCount reads a count only when actually stated', () => {
    assert.equal(extractExplicitItemCount('give me 10 questions about REST APIs'), 10);
    assert.equal(extractExplicitItemCount('5 item quiz'), 5);
    assert.equal(extractExplicitItemCount('quiz me about SOLID'), null);
  });

  await t.test('looksLikeTopicAnswer accepts short bare phrases, rejects full sentences/escapes', () => {
    for (const msg of ['Operating Systems', 'subnetting', 'System integration.', 'REST APIs']) {
      assert.equal(looksLikeTopicAnswer(msg), true, msg);
    }
    for (const msg of [
      'What topic do you mean?',
      'Can you explain that instead?',
      'Actually, never mind.',
      'This is a much longer sentence than a bare topic phrase would ever be',
      '',
      '   ',
    ]) {
      assert.equal(looksLikeTopicAnswer(msg), false, msg);
    }
  });

  await t.test('cleanTopic trims and strips trailing punctuation', () => {
    assert.equal(cleanTopic('  Operating Systems.  '), 'Operating Systems');
    assert.equal(cleanTopic('subnetting!'), 'subnetting');
  });
});
