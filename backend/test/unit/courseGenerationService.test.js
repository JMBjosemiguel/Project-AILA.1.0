'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readRoadmapAttempt, readLessonAttempt, ROADMAP_MAX_OUTPUT_TOKENS, LESSON_MAX_OUTPUT_TOKENS,
  courseOptionsRules, buildStoredSubjectContext, roadmapOutputBudget,
} = require('../../src/services/courseGenerationService');

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

test('courseOptionsRules', async (t) => {
  await t.test('null/undefined courseOptions produces no rules at all — existing courses are unaffected', () => {
    assert.equal(courseOptionsRules(null), '');
    assert.equal(courseOptionsRules(undefined), '');
    assert.equal(courseOptionsRules(null, { includeLength: true }), '');
  });

  await t.test('a known purpose adds its specific guidance', () => {
    const rules = courseOptionsRules({ purpose: 'board_exam', length: 'standard', focus: [] });
    assert.match(rules, /board.exam/i);
    assert.match(rules, /NLE/);
  });

  await t.test('length is only included for the roadmap (includeLength: true), and only when non-standard', () => {
    const forLesson = courseOptionsRules({ purpose: 'from_scratch', length: 'in_depth', focus: [] });
    assert.doesNotMatch(forLesson, /5-6 modules/);

    const standardRoadmap = courseOptionsRules({ purpose: 'from_scratch', length: 'standard', focus: [] }, { includeLength: true });
    assert.doesNotMatch(standardRoadmap, /modules total/, 'standard keeps the base "2-4 modules" rule untouched — no override line');

    const shortRoadmap = courseOptionsRules({ purpose: 'from_scratch', length: 'short', focus: [] }, { includeLength: true });
    assert.match(shortRoadmap, /2-3 modules total/);

    const inDepthRoadmap = courseOptionsRules({ purpose: 'from_scratch', length: 'in_depth', focus: [] }, { includeLength: true });
    assert.match(inDepthRoadmap, /5-6 modules total/);
  });

  await t.test('focus areas are combined into one sentence, unknown keys are silently dropped', () => {
    const rules = courseOptionsRules({ purpose: 'from_scratch', length: 'standard', focus: ['case_scenarios', 'summaries_tables', 'not_a_real_key'] });
    assert.match(rules, /case scenarios|patient cases/i);
    assert.match(rules, /summary tables|comparison tables/i);
  });

  await t.test('an empty focus array adds nothing', () => {
    const withEmptyFocus = courseOptionsRules({ purpose: 'from_scratch', length: 'standard', focus: [] });
    const withNoFocusKey = courseOptionsRules({ purpose: 'from_scratch', length: 'standard' });
    assert.equal(withEmptyFocus, withNoFocusKey);
  });
});

test('roadmapOutputBudget', async (t) => {
  await t.test('an unspecified or "standard" length keeps the exact original flat budget', () => {
    assert.equal(roadmapOutputBudget(undefined), ROADMAP_MAX_OUTPUT_TOKENS);
    assert.equal(roadmapOutputBudget('standard'), ROADMAP_MAX_OUTPUT_TOKENS);
  });

  await t.test('in_depth gets a larger budget than standard, short gets a smaller one', () => {
    assert.ok(roadmapOutputBudget('in_depth') > ROADMAP_MAX_OUTPUT_TOKENS);
    assert.ok(roadmapOutputBudget('short') < ROADMAP_MAX_OUTPUT_TOKENS);
  });

  await t.test('an unknown length value falls back to the original budget, never throws', () => {
    assert.equal(roadmapOutputBudget('nonsense'), ROADMAP_MAX_OUTPUT_TOKENS);
  });
});

test('buildStoredSubjectContext', async (t) => {
  await t.test('no context and no courseOptions stores null — unchanged from before this feature', () => {
    assert.equal(buildStoredSubjectContext(null, null), null);
  });

  await t.test('courseOptions alone (no personalization context) is still stored', () => {
    const stored = buildStoredSubjectContext(null, { purpose: 'mastery', length: 'short', focus: [] });
    assert.deepEqual(JSON.parse(stored), { courseOptions: { purpose: 'mastery', length: 'short', focus: [] } });
  });

  await t.test('courseOptions and a personalization context merge into one object, never overwriting each other', () => {
    const context = {
      generationType: 'course', personalizationLevel: 'basic',
      profile: { program: 'BS Nursing', yearLevel: 2 },
      preferences: {}, course: {}, performance: { weakTopics: [], strongerTopics: [] }, engagement: {},
    };
    const stored = buildStoredSubjectContext(context, { purpose: 'board_exam', length: 'standard', focus: ['case_scenarios'] });
    const parsed = JSON.parse(stored);
    assert.equal(parsed.program, 'BS Nursing');
    assert.deepEqual(parsed.courseOptions, { purpose: 'board_exam', length: 'standard', focus: ['case_scenarios'] });
  });
});
