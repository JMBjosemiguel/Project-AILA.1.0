'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { quizOutputBudget, readGeminiJson } = require('../../src/services/quizService');

function geminiPayload({ finishReason = 'STOP', text = '', usage = {} } = {}) {
  return {
    candidates: [{ finishReason, content: { parts: [{ text }] } }],
    usageMetadata: usage,
  };
}

test('quizOutputBudget', async (t) => {
  await t.test('grows with item count, with room to spare over a flat 2048', () => {
    assert.ok(quizOutputBudget(1) > 0);
    assert.ok(quizOutputBudget(5) < quizOutputBudget(10));
    assert.ok(quizOutputBudget(10) < quizOutputBudget(16));
    assert.ok(quizOutputBudget(16) < quizOutputBudget(20));
  });

  await t.test('covers the full validated range (up to 20 items) with headroom', () => {
    // The old flat 2048 cap is what caused the truncation bug in the first
    // place — the new budget must clear it by a comfortable margin at every
    // size the product actually requests (CHECKPOINT_ITEMS=8, FINAL_ITEMS=16,
    // and the UI/validator ceiling of 20).
    assert.ok(quizOutputBudget(8) > 2048);
    assert.ok(quizOutputBudget(16) > 3072);
    assert.ok(quizOutputBudget(20) > 4000);
  });

  await t.test('never exceeds the sanity cap, even for a bogus/huge item count', () => {
    assert.ok(quizOutputBudget(10_000) <= 8192);
  });

  await t.test('zero or negative item count still returns a sane positive budget', () => {
    assert.ok(quizOutputBudget(0) > 0);
    assert.ok(quizOutputBudget(-5) > 0);
  });
});

test('readGeminiJson', async (t) => {
  await t.test('a clean STOP response with valid JSON parses normally', () => {
    const payload = geminiPayload({
      finishReason: 'STOP',
      text: '{"topic":"Subnetting","quizType":"multiple_choice","items":[]}',
      usage: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
    });
    const { parsed, finishReason, usage } = readGeminiJson(payload);
    assert.deepEqual(parsed, { topic: 'Subnetting', quizType: 'multiple_choice', items: [] });
    assert.equal(finishReason, 'STOP');
    assert.equal(usage.thoughtsTokenCount, 5);
  });

  await t.test('a MAX_TOKENS response with truncated JSON is treated as no result, not a throw', () => {
    const payload = geminiPayload({
      finishReason: 'MAX_TOKENS',
      text: '{"topic":"Subnetting","quizType":"multiple_choice","items":[{"question":"What is a',
      usage: { promptTokenCount: 231, candidatesTokenCount: 369, thoughtsTokenCount: 1664 },
    });
    const { parsed, finishReason, usage } = readGeminiJson(payload);
    assert.equal(parsed, null);
    assert.equal(finishReason, 'MAX_TOKENS');
    assert.equal(usage.thoughtsTokenCount, 1664);
  });

  await t.test('no candidates / empty text never throws — just reports no result', () => {
    const { parsed, finishReason } = readGeminiJson({ candidates: [] });
    assert.equal(parsed, null);
    assert.equal(finishReason, undefined);
  });

  await t.test('STOP but genuinely malformed (non-JSON) text is also treated as no result', () => {
    const payload = geminiPayload({ finishReason: 'STOP', text: 'not json at all' });
    const { parsed } = readGeminiJson(payload);
    assert.equal(parsed, null);
  });
});
