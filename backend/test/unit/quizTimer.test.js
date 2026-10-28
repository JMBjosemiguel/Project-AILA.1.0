'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const { QUIZ_TIME_LIMIT_MINUTES, isTimerEligible } = require('../../src/constants/quizTimer');
const { startAttemptValidator } = require('../../src/validators/quizValidator');

async function invalidFields(body) {
  const req = { params: { quizId: '5' }, body };
  for (const chain of startAttemptValidator) await chain.run(req);
  return { fields: validationResult(req).array().map((error) => error.path), body: req.body };
}

test('quiz time limit options', () => {
  assert.deepEqual(QUIZ_TIME_LIMIT_MINUTES, [5, 10, 15, 20, 30, 45, 60]);
});

test('isTimerEligible: Learning Hub and Resource Library quizzes only', async (t) => {
  await t.test('lesson, topic and resource practice quizzes are timed', () => {
    for (const source_type of ['lesson', 'topic', 'resource']) {
      assert.equal(isTimerEligible({ source_type, assessment_kind: 'practice' }), true, source_type);
    }
  });

  await t.test('module checkpoints and course finals are timed', () => {
    for (const assessment_kind of ['module_checkpoint', 'course_final']) {
      assert.equal(isTimerEligible({ source_type: null, assessment_kind }), true, assessment_kind);
    }
  });

  await t.test('chat quizzes, copied shared quizzes and manual quizzes are not', () => {
    assert.equal(isTimerEligible({ source_type: 'chat', assessment_kind: 'practice' }), false);
    assert.equal(isTimerEligible({ source_type: null, assessment_kind: 'practice' }), false);
    assert.equal(isTimerEligible({ source_type: 'manual', assessment_kind: 'practice' }), false);
    assert.equal(isTimerEligible(null), false);
  });
});

test('startAttemptValidator: timeLimitMinutes', async (t) => {
  await t.test('accepts every listed limit, null (no limit), or omitted (not chosen yet)', async () => {
    for (const timeLimitMinutes of [...QUIZ_TIME_LIMIT_MINUTES, null]) {
      // eslint-disable-next-line no-await-in-loop
      const { fields } = await invalidFields({ timeLimitMinutes });
      assert.deepEqual(fields, [], String(timeLimitMinutes));
    }
    const omitted = await invalidFields({});
    assert.deepEqual(omitted.fields, []);
    assert.equal('timeLimitMinutes' in omitted.body, false, 'omitted stays omitted');
  });

  await t.test('converts a numeric string to a number', async () => {
    const { fields, body } = await invalidFields({ timeLimitMinutes: '15' });
    assert.deepEqual(fields, []);
    assert.equal(body.timeLimitMinutes, 15);
  });

  await t.test('rejects anything else', async () => {
    for (const timeLimitMinutes of [0, 7, 90, -5, 'abc', '10.5', true]) {
      // eslint-disable-next-line no-await-in-loop
      const { fields } = await invalidFields({ timeLimitMinutes });
      assert.deepEqual(fields, ['timeLimitMinutes'], JSON.stringify(timeLimitMinutes));
    }
  });
});
