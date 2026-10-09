'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { readRoadmapAttempt, readLessonAttempt, ROADMAP_MAX_OUTPUT_TOKENS, LESSON_MAX_OUTPUT_TOKENS } = require('../../src/services/courseGenerationService');

function geminiPayload({ finishReason = 'STOP', text = '', usage = {} } = {}) {
  return {
    candidates: [{ finishReason, content: { parts: [{ text }] } }],
    usageMetadata: usage,
  };
}

test('course generation output budgets', async (t) => {
  await t.test('both budgets clear the old flat caps that caused truncation, with room to spare', () => {
    // 3072/2048 were the original caps; 'medium' thinking alone consumed
    // ~900-1400 tokens of them in live calibration, leaving too little room
    // for a full roadmap or a 9-section lesson.
    assert.ok(ROADMAP_MAX_OUTPUT_TOKENS > 3072);
    assert.ok(LESSON_MAX_OUTPUT_TOKENS > 2048);
  });
});

test('readRoadmapAttempt', async (t) => {
  await t.test('a clean STOP response with a non-empty modules array is accepted', () => {
    const payload = geminiPayload({
      finishReason: 'STOP',
      text: JSON.stringify({ modules: [{ title: 'M1', topics: [{ title: 'T1', lessons: [{ title: 'L1' }] }] }] }),
    });
    const modules = readRoadmapAttempt(payload);
    assert.equal(modules.length, 1);
    assert.equal(modules[0].title, 'M1');
  });

  await t.test('MAX_TOKENS with a technically-valid but incomplete JSON object is rejected, not silently accepted', () => {
    // This is the exact bug: Gemini can get cut off after closing a short
    // modules array, producing JSON that parses fine but is nowhere near
    // the intended 2-4 modules. finishReason must gate it, not just parsing.
    const payload = geminiPayload({
      finishReason: 'MAX_TOKENS',
      text: JSON.stringify({ modules: [{ title: 'Only one module', topics: [] }] }),
      usage: { thoughtsTokenCount: 2800, candidatesTokenCount: 200 },
    });
    assert.deepEqual(readRoadmapAttempt(payload), []);
  });

  await t.test('MAX_TOKENS with genuinely truncated (unparseable) JSON is rejected', () => {
    const payload = geminiPayload({
      finishReason: 'MAX_TOKENS',
      text: '{"modules":[{"title":"M1","topics":[{"title":"T1","lessons":[{"title":"L',
    });
    assert.deepEqual(readRoadmapAttempt(payload), []);
  });

  await t.test('STOP with an empty modules array is rejected', () => {
    const payload = geminiPayload({ finishReason: 'STOP', text: JSON.stringify({ modules: [] }) });
    assert.deepEqual(readRoadmapAttempt(payload), []);
  });

  await t.test('no candidates / empty text never throws', () => {
    assert.deepEqual(readRoadmapAttempt({ candidates: [] }), []);
  });
});

test('readLessonAttempt', async (t) => {
  await t.test('a clean STOP response with non-empty text is accepted', () => {
    const payload = geminiPayload({ finishReason: 'STOP', text: '## Objectives\nSomething real.' });
    assert.equal(readLessonAttempt(payload), '## Objectives\nSomething real.');
  });

  await t.test('MAX_TOKENS with non-empty (but incomplete) markdown is rejected, not silently saved', () => {
    // This is the exact bug: a truncated lesson is still non-empty text —
    // there is no JSON to fail parsing, so finishReason is the only signal.
    const payload = geminiPayload({
      finishReason: 'MAX_TOKENS',
      text: '## Objectives\n- one\n## Summary\nCut off mid-sent',
      usage: { thoughtsTokenCount: 1900, candidatesTokenCount: 148 },
    });
    assert.equal(readLessonAttempt(payload), '');
  });

  await t.test('STOP with empty text is rejected', () => {
    assert.equal(readLessonAttempt(geminiPayload({ finishReason: 'STOP', text: '' })), '');
  });

  await t.test('no candidates never throws', () => {
    assert.equal(readLessonAttempt({ candidates: [] }), '');
  });
});
