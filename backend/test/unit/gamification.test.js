'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { xpProgress, levelForXp, XP_PER_LEVEL, displayStreak } = require('../../src/utils/gamification');
const { meetsCriteria, progressFor } = require('../../src/services/achievementService');

const APPTIME_PATH = require.resolve('../../src/utils/appTime');
const GAMIFICATION_PATH = require.resolve('../../src/utils/gamification');

// gamification.js destructures appTime's exports at require time, so reload
// both together per timezone — same pattern as appTime.test.js.
function loadWithTz(tz) {
  const prev = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = tz;
  delete require.cache[APPTIME_PATH];
  delete require.cache[GAMIFICATION_PATH];
  const mod = require('../../src/utils/gamification');
  if (prev === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = prev;
  return mod;
}

test.after(() => {
  delete require.cache[APPTIME_PATH];
  delete require.cache[GAMIFICATION_PATH];
  require('../../src/utils/gamification');
});

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

test('displayStreak keeps the stored count when last active today or yesterday', () => {
  const g = loadWithTz('UTC');
  const now = new Date('2026-09-09T10:00:00Z'); // today = 2026-09-09
  assert.equal(g.displayStreak({ current_streak: 5, last_active_date: '2026-09-09' }, now), 5);
  assert.equal(g.displayStreak({ current_streak: 5, last_active_date: '2026-09-08' }, now), 5);
});

test('displayStreak reports 0 once the grace window has lapsed — the Friday-to-Sunday bug', () => {
  const g = loadWithTz('UTC');
  // Sunday 2026-09-13, last active Friday 2026-09-11 — a 2-day gap, so
  // yesterday (the 12th) doesn't match: the streak is broken, not "1 day".
  const now = new Date('2026-09-13T10:00:00Z');
  assert.equal(g.displayStreak({ current_streak: 1, last_active_date: '2026-09-11' }, now), 0);
});

test('displayStreak accepts a Date object for last_active_date (what mysql2 returns for a DATE column under timezone:"Z")', () => {
  const g = loadWithTz('Asia/Manila');
  const now = new Date('2026-09-09T05:00:00Z'); // 13:00 Manila on the 9th
  assert.equal(g.displayStreak({ current_streak: 3, last_active_date: new Date('2026-09-09T00:00:00.000Z') }, now), 3);
});

test('displayStreak is 0 when there is no last_active_date at all', () => {
  const g = loadWithTz('UTC');
  assert.equal(g.displayStreak({ current_streak: 0, last_active_date: null }, new Date('2026-09-09T10:00:00Z')), 0);
});

