'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { isAnswerMatch } = require('../../src/services/quizService');

test('isAnswerMatch — identification', async (t) => {
  await t.test('accepts case and plural variations', () => {
    assert.equal(isAnswerMatch('VACUUM TUBES', 'Vacuum tube', 'identification'), true);
    assert.equal(isAnswerMatch(' transistor. ', 'Transistor', 'identification'), true);
  });

  await t.test('rejects a genuinely wrong answer', () => {
    assert.equal(isAnswerMatch('Tube', 'Transistor', 'identification'), false);
  });

  await t.test('still requires an exact match once normalized/pluralized', () => {
    assert.equal(isAnswerMatch('Resistor', 'Transistor', 'identification'), false);
  });
});

test('isAnswerMatch — multiple_choice and true_false stay exact', async (t) => {
  await t.test('multiple_choice: case/whitespace-insensitive exact match only, no plural tolerance', () => {
    assert.equal(isAnswerMatch('  A  ', 'a', 'multiple_choice'), true);
    assert.equal(isAnswerMatch('Cats', 'Cat', 'multiple_choice'), false);
  });

  await t.test('true_false: exact match only', () => {
    assert.equal(isAnswerMatch('True', 'True', 'true_false'), true);
    assert.equal(isAnswerMatch('True', 'False', 'true_false'), false);
  });
});
