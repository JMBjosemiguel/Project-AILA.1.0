'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// buildSubtopicPlan is a pure-ish function around one Gemini call — stub the
// client before requiring the service so the module under test picks up the
// stub (same require-cache-clearing pattern as courseAssessments.test.js).
const gemini = require('../../src/services/geminiClient');
let lastPlanResponse = null;
let planCalls = 0;
gemini.callGemini = async () => {
  planCalls += 1;
  if (lastPlanResponse === 'throw') throw new Error('stubbed Gemini failure');
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(lastPlanResponse) }] } }],
  };
};
delete require.cache[require.resolve('../../src/services/quizService')];
const { buildSubtopicPlan, BATCH_MAX_ITEMS } = require('../../src/services/quizService');

function resetPlan(response) {
  lastPlanResponse = response;
  planCalls = 0;
}

test('buildSubtopicPlan', async (t) => {
  await t.test('a single batch never calls Gemini — just the raw topic', async () => {
    resetPlan({ subtopics: ['should never be read'] });
    const plan = await buildSubtopicPlan({ topic: 'Networking', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 1 });
    assert.deepEqual(plan, ['Networking']);
    assert.equal(planCalls, 0);
  });

  await t.test('multiple batches: returns exactly numBatches subtopics from a well-formed response', async () => {
    resetPlan({ subtopics: ['OSI layers', 'Subnetting', 'Routing protocols'] });
    const plan = await buildSubtopicPlan({ topic: 'Networking', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 3 });
    assert.equal(plan.length, 3);
    assert.deepEqual(plan, ['OSI layers', 'Subnetting', 'Routing protocols']);
    assert.equal(planCalls, 1);
  });

  await t.test('a short response is padded with the raw topic to reach numBatches', async () => {
    resetPlan({ subtopics: ['OSI layers'] });
    const plan = await buildSubtopicPlan({ topic: 'Networking', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 3 });
    assert.equal(plan.length, 3);
    assert.equal(plan[0], 'OSI layers');
    assert.equal(plan[1], 'Networking');
    assert.equal(plan[2], 'Networking');
  });

  await t.test('an empty/malformed response falls back to the raw topic repeated numBatches times', async () => {
    resetPlan({ subtopics: [] });
    const plan = await buildSubtopicPlan({ topic: 'Networking', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 4 });
    assert.deepEqual(plan, ['Networking', 'Networking', 'Networking', 'Networking']);
  });

  await t.test('a thrown Gemini error falls back to the raw topic, never rejects', async () => {
    resetPlan('throw');
    const plan = await buildSubtopicPlan({ topic: 'Databases', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 2 });
    assert.deepEqual(plan, ['Databases', 'Databases']);
  });

  await t.test('extra subtopics beyond numBatches are trimmed', async () => {
    resetPlan({ subtopics: ['A', 'B', 'C', 'D', 'E'] });
    const plan = await buildSubtopicPlan({ topic: 'X', quizType: 'multiple_choice', difficulty: 'medium', numBatches: 2 });
    assert.deepEqual(plan, ['A', 'B']);
  });

  await t.test('150 items at BATCH_MAX_ITEMS=15 needs exactly 10 batches', () => {
    assert.equal(Math.ceil(150 / BATCH_MAX_ITEMS), 10);
  });
});
