'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readRoadmapAttempt, readLessonAttempt, ROADMAP_MAX_OUTPUT_TOKENS, LESSON_MAX_OUTPUT_TOKENS,
  courseOptionsRules, buildStoredSubjectContext, roadmapOutputBudget, fitRoadmapToLength, betterRoadmap,
} = require('../../src/services/courseGenerationService');
const {
  COURSE_LENGTH_SIZES, COURSE_LENGTHS, COURSE_LENGTH_KEYS, courseLengthSize, courseLengthRule,
} = require('../../src/constants/courseOptions');

// A roadmap with `modules` modules, each with `topics` topics of `lessons` lessons.
function roadmap(modules, topics = 3, lessons = 2) {
  return Array.from({ length: modules }, (_, m) => ({
    title: `Module ${m + 1}`,
    topics: Array.from({ length: topics }, (__, t) => ({
      title: `Topic ${m + 1}.${t + 1}`,
      lessons: Array.from({ length: lessons }, (___, l) => ({ title: `Lesson ${m + 1}.${t + 1}.${l + 1}`, estimatedMinutes: 15 })),
    })),
  }));
}

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

  await t.test('the roadmap gets the exact module count for every length; lessons never get a length rule', () => {
    const forLesson = courseOptionsRules({ purpose: 'from_scratch', length: 'in_depth', focus: [] });
    assert.doesNotMatch(forLesson, /modules/);

    for (const [length, count] of [['short', 2], ['standard', 4], ['in_depth', 6]]) {
      const rules = courseOptionsRules({ purpose: 'from_scratch', length, focus: [] }, { includeLength: true });
      assert.match(rules, new RegExp(`Produce EXACTLY ${count} modules — no more and no fewer\\.`), length);
    }
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

test('course length mapping', async (t) => {
  await t.test('Short = 2, Standard = 4, In-depth = 6 modules; every length keeps 2-3 topics and 1-2 lessons', () => {
    assert.deepEqual(COURSE_LENGTH_KEYS, ['short', 'standard', 'in_depth']);
    assert.deepEqual(COURSE_LENGTH_KEYS.map((key) => COURSE_LENGTH_SIZES[key].modules), [2, 4, 6]);
    for (const key of COURSE_LENGTH_KEYS) {
      assert.deepEqual(COURSE_LENGTH_SIZES[key].topicsPerModule, { min: 2, max: 3 });
      assert.deepEqual(COURSE_LENGTH_SIZES[key].lessonsPerTopic, { min: 1, max: 2 });
    }
    assert.deepEqual(COURSE_LENGTHS, { short: 'Short: 2 modules', standard: 'Standard: 4 modules', in_depth: 'In-depth: 6 modules' });
  });

  await t.test('a missing or unknown length is treated as Standard', () => {
    assert.equal(courseLengthSize(undefined).modules, 4);
    assert.equal(courseLengthSize('nonsense').modules, 4);
    assert.match(courseLengthRule(undefined), /EXACTLY 4 modules/);
  });

  await t.test('the module ranges no longer overlap between lengths', () => {
    const counts = COURSE_LENGTH_KEYS.map((key) => COURSE_LENGTH_SIZES[key].modules);
    assert.equal(new Set(counts).size, counts.length);
  });
});

test('fitRoadmapToLength — enforcement after Gemini replies', async (t) => {
  await t.test('too many: extra modules, topics and lessons are trimmed, keeping the first ones in order', () => {
    const fit = fitRoadmapToLength(roadmap(5, 4, 3), 'short');
    assert.equal(fit.complete, true);
    assert.equal(fit.target, 2);
    assert.deepEqual(fit.modules.map((m) => m.title), ['Module 1', 'Module 2']);
    for (const module_ of fit.modules) {
      assert.equal(module_.topics.length, 3);
      for (const topic of module_.topics) assert.equal(topic.lessons.length, 2);
    }
    assert.equal(fit.modules[1].topics[2].lessons[1].title, 'Lesson 2.3.2');
  });

  await t.test('exactly right: kept as is', () => {
    const fit = fitRoadmapToLength(roadmap(4, 2, 1), 'standard');
    assert.equal(fit.complete, true);
    assert.equal(fit.modules.length, 4);
    assert.deepEqual(fit.modules.map((m) => m.topics.length), [2, 2, 2, 2]);
  });

  await t.test('too few modules (a Medium-size reply for an In-depth course) is incomplete, but kept', () => {
    const fit = fitRoadmapToLength(roadmap(4), 'in_depth');
    assert.equal(fit.complete, false);
    assert.equal(fit.target, 6);
    assert.equal(fit.modules.length, 4);
  });

  await t.test('too few topics in a module is incomplete; empty or untitled entries are dropped', () => {
    const raw = roadmap(2);
    raw[1].topics = [raw[1].topics[0], { title: 'No lessons', lessons: [] }, { title: '  ', lessons: [{ title: 'x' }] }];
    raw.push({ title: '', topics: roadmap(1)[0].topics });
    raw[0].topics[0].lessons.push({ title: '' });
    const fit = fitRoadmapToLength(raw, 'short');
    assert.equal(fit.complete, false);
    assert.equal(fit.modules.length, 2);
    assert.deepEqual(fit.modules[1].topics.map((topic) => topic.title), ['Topic 2.1']);
    assert.equal(fit.modules[0].topics[0].lessons.length, 2);
  });

  await t.test('nothing usable gives an empty, incomplete result (never throws)', () => {
    for (const value of [[], null, undefined, [{}], [{ title: 'M', topics: 'nope' }]]) {
      const fit = fitRoadmapToLength(value, 'short');
      assert.deepEqual(fit.modules, []);
      assert.equal(fit.complete, false);
    }
  });

  await t.test('betterRoadmap keeps the attempt closest to the requested size', () => {
    const complete = fitRoadmapToLength(roadmap(2), 'short');
    const short = fitRoadmapToLength(roadmap(1), 'short');
    assert.equal(betterRoadmap(short, complete), complete);
    assert.equal(betterRoadmap(complete, short), complete);
    const three = fitRoadmapToLength(roadmap(3), 'in_depth');
    const five = fitRoadmapToLength(roadmap(5), 'in_depth');
    assert.equal(betterRoadmap(three, five), five);
    assert.equal(betterRoadmap(five, three), five);
    const empty = fitRoadmapToLength([], 'in_depth');
    assert.equal(betterRoadmap(three, empty), three);
    assert.equal(betterRoadmap(three, undefined), three);
  });
});

test('roadmapOutputBudget', async (t) => {
  await t.test('an unspecified or "standard" length keeps the exact original flat budget', () => {
    assert.equal(roadmapOutputBudget(undefined), ROADMAP_MAX_OUTPUT_TOKENS);
    assert.equal(roadmapOutputBudget('standard'), ROADMAP_MAX_OUTPUT_TOKENS);
  });

  await t.test('in_depth gets a larger budget than standard, short gets 4,096 (thinking shares the cap)', () => {
    assert.ok(roadmapOutputBudget('in_depth') > ROADMAP_MAX_OUTPUT_TOKENS);
    assert.equal(roadmapOutputBudget('short'), 4096);
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
