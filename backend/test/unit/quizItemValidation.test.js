'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateAndCleanQuizItems } = require('../../src/services/quizService');

const goodMc = { question: 'What is 2+2?', options: ['1', '2', '3', '4'], correctAnswer: '4', explanation: 'Basic addition.' };

test('validateAndCleanQuizItems', async (t) => {
  await t.test('keeps well-formed multiple_choice items', () => {
    const items = validateAndCleanQuizItems([goodMc], 'multiple_choice');
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].options, ['1', '2', '3', '4']);
  });

  await t.test('drops items with an empty question, answer, or explanation', () => {
    const items = validateAndCleanQuizItems([
      { ...goodMc, question: '' },
      { ...goodMc, question: '   ' },
      { ...goodMc, correctAnswer: '' },
      { ...goodMc, explanation: '' },
    ], 'multiple_choice');
    assert.equal(items.length, 0);
  });

  await t.test('multiple_choice: requires exactly 4 options', () => {
    assert.equal(validateAndCleanQuizItems([{ ...goodMc, options: ['1', '2', '3'] }], 'multiple_choice').length, 0);
    assert.equal(validateAndCleanQuizItems([{ ...goodMc, options: ['1', '2', '3', '4', '5'] }], 'multiple_choice').length, 0);
  });

  await t.test('multiple_choice: correctAnswer must match one of the options (case-insensitive)', () => {
    assert.equal(validateAndCleanQuizItems([{ ...goodMc, correctAnswer: 'FOUR' }], 'multiple_choice').length, 0);
    const items = validateAndCleanQuizItems([{ ...goodMc, correctAnswer: '4' }], 'multiple_choice');
    assert.equal(items.length, 1);
  });

  await t.test('drops malformed / non-object / null items without crashing', () => {
    const items = validateAndCleanQuizItems([null, undefined, 'a string', 42, {}, goodMc], 'multiple_choice');
    assert.equal(items.length, 1);
  });

  await t.test('drops duplicate questions (case/whitespace-insensitive), keeps the first', () => {
    const items = validateAndCleanQuizItems([
      goodMc,
      { ...goodMc, question: '  WHAT IS 2+2?  ', explanation: 'a different explanation' },
    ], 'multiple_choice');
    assert.equal(items.length, 1);
    assert.equal(items[0].explanation, 'Basic addition.');
  });

  await t.test('true_false: normalizes options to exactly ["True","False"] and requires a valid correctAnswer', () => {
    const items = validateAndCleanQuizItems([
      { question: 'TCP is connection-oriented.', options: ['true', 'false'], correctAnswer: 'true', explanation: 'It uses a handshake.' },
    ], 'true_false');
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].options, ['True', 'False']);

    const bad = validateAndCleanQuizItems([
      { question: 'X', options: ['True', 'False'], correctAnswer: 'maybe', explanation: 'x' },
    ], 'true_false');
    assert.equal(bad.length, 0);
  });

  await t.test('identification: options are always cleared regardless of what was supplied', () => {
    const items = validateAndCleanQuizItems([
      { question: 'What protocol is UDP?', options: ['junk', 'options'], correctAnswer: 'connectionless', explanation: 'No handshake.' },
    ], 'identification');
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].options, []);
  });

  await t.test('an unknown quizType yields no items (fail closed, not silently accepted)', () => {
    assert.equal(validateAndCleanQuizItems([goodMc], 'essay').length, 0);
  });

  await t.test('non-array input returns an empty array instead of throwing', () => {
    assert.deepEqual(validateAndCleanQuizItems(null, 'multiple_choice'), []);
    assert.deepEqual(validateAndCleanQuizItems(undefined, 'multiple_choice'), []);
    assert.deepEqual(validateAndCleanQuizItems('not an array', 'multiple_choice'), []);
  });

  await t.test('a numeric correctAnswer is coerced to a string safely', () => {
    const items = validateAndCleanQuizItems([
      { question: 'How many bits in a byte?', options: ['4', '8', '16', '32'], correctAnswer: 8, explanation: 'A byte is 8 bits.' },
    ], 'multiple_choice');
    assert.equal(items.length, 1);
    assert.equal(items[0].correctAnswer, '8');
  });
});
