'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { xpProgress, levelForXp, XP_PER_LEVEL } = require('../../src/utils/gamification');
const { meetsCriteria, progressFor } = require('../../src/services/achievementService');

test('XP_PER_LEVEL is the documented 100-point step', () => {
  assert.equal(XP_PER_LEVEL, 100);
});

test('levelForXp uses floor(xp / 100) + 1 with clean boundaries', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(199), 2);
  assert.equal(levelForXp(200), 3);
  assert.equal(levelForXp(-50), 1, 'negative XP never drops below level 1');
});

test('xpProgress is the single source of truth for "how far into this level"', () => {
  assert.deepEqual(xpProgress(0), {
    currentXp: 0, level: 1, xpIntoLevel: 0, xpForNextLevel: 100, xpToNextLevel: 100, progressPercent: 0,
  });
  assert.deepEqual(xpProgress(50), {
    currentXp: 50, level: 1, xpIntoLevel: 50, xpForNextLevel: 100, xpToNextLevel: 50, progressPercent: 50,
  });
  assert.deepEqual(xpProgress(100), {
    currentXp: 100, level: 2, xpIntoLevel: 0, xpForNextLevel: 100, xpToNextLevel: 100, progressPercent: 0,
  });
  assert.deepEqual(xpProgress(250), {
    currentXp: 250, level: 3, xpIntoLevel: 50, xpForNextLevel: 100, xpToNextLevel: 50, progressPercent: 50,
  });
});

test('xpProgress tolerates junk input without throwing', () => {
  assert.equal(xpProgress(null).currentXp, 0);
  assert.equal(xpProgress(undefined).currentXp, 0);
  assert.equal(xpProgress(NaN).currentXp, 0);
  assert.equal(xpProgress(-999).currentXp, 0);
  assert.equal(xpProgress('120').level, 2, 'numeric strings are coerced');
});

test('meetsCriteria evaluates every achievement criteria type against the metrics snapshot', () => {
  const metrics = {
    lessonsCompleted: 7,
    hasSubmittedQuiz: true,
    hasPerfectQuiz: false,
    hasPassedCheckpoint: true,
    hasPassedFinal: false,
    streakDays: 5,
    level: 4,
  };

  assert.equal(meetsCriteria({ criteria_type: 'lessons_completed', criteria_value: 5 }, metrics), true);
  assert.equal(meetsCriteria({ criteria_type: 'lessons_completed', criteria_value: 10 }, metrics), false);
  assert.equal(meetsCriteria({ criteria_type: 'first_quiz', criteria_value: 1 }, metrics), true);
  assert.equal(meetsCriteria({ criteria_type: 'perfect_quiz', criteria_value: 1 }, metrics), false);
  assert.equal(meetsCriteria({ criteria_type: 'checkpoint_passed', criteria_value: 1 }, metrics), true);
  assert.equal(meetsCriteria({ criteria_type: 'course_completed', criteria_value: 1 }, metrics), false);
  assert.equal(meetsCriteria({ criteria_type: 'streak_days', criteria_value: 3 }, metrics), true);
  assert.equal(meetsCriteria({ criteria_type: 'streak_days', criteria_value: 7 }, metrics), false);
  assert.equal(meetsCriteria({ criteria_type: 'level_reached', criteria_value: 4 }, metrics), true);
  assert.equal(meetsCriteria({ criteria_type: 'level_reached', criteria_value: 5 }, metrics), false);
  assert.equal(meetsCriteria({ criteria_type: 'unknown_type', criteria_value: 1 }, metrics), false);
});

test('progressFor returns a fraction only for countable achievements, null for binary ones', () => {
  const metrics = { lessonsCompleted: 3, streakDays: 2, level: 4 };
  assert.deepEqual(progressFor('lessons_completed', 10, metrics), { current: 3, target: 10 });
  assert.deepEqual(progressFor('streak_days', 7, metrics), { current: 2, target: 7 });
  assert.deepEqual(progressFor('level_reached', 5, metrics), { current: 4, target: 5 });
  assert.equal(progressFor('first_quiz', 1, metrics), null);
  assert.equal(progressFor('perfect_quiz', 1, metrics), null);
  assert.equal(progressFor('checkpoint_passed', 1, metrics), null);
  assert.equal(progressFor('course_completed', 1, metrics), null);
});

