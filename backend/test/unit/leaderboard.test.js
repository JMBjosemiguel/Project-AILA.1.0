'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { displayName, startOfWeek, LEADERBOARD_PERIODS } = require('../../src/services/gamificationService');

test('leaderboard exposes exactly the weekly / all_time periods', () => {
  assert.deepEqual([...LEADERBOARD_PERIODS].sort(), ['all_time', 'weekly']);
});

test('leaderboard display name is first name + last initial only — never the full surname', () => {
  assert.equal(displayName('Jose', 'Belleza'), 'Jose B.');
  assert.equal(displayName('  Ana  ', 'dela Cruz'), 'Ana D.');
  assert.equal(displayName('Sam', ''), 'Sam');
  assert.equal(displayName('', 'Reyes'), 'Student R.');
  assert.equal(displayName(null, null), 'Student');
});

test('startOfWeek is stable within a week and advances exactly 7 days between weeks', () => {
  // Exact timezone math is covered by appTime.test.js (which controls the env);
  // here we only assert the leaderboard uses ONE consistent week window. Dates are
  // chosen to sit mid-week in any zone from UTC to UTC+8 (2026-09-08 is a Tuesday).
  const tue = startOfWeek(new Date('2026-09-08T04:00:00Z'));
  const fri = startOfWeek(new Date('2026-09-11T04:00:00Z'));
  assert.equal(fri.getTime(), tue.getTime(), 'same week -> same window start');

  const nextWeek = startOfWeek(new Date('2026-09-16T04:00:00Z'));
  assert.equal((nextWeek.getTime() - tue.getTime()) / 86400000, 7, 'next week starts exactly 7 days later');
});
