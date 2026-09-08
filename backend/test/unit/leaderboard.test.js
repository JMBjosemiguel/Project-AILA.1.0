'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { displayName, startOfWeekUtc, LEADERBOARD_PERIODS } = require('../../src/services/gamificationService');

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

test('startOfWeekUtc returns Monday 00:00:00 UTC for any day of the week', () => {
  // 2026-09-08 is a Tuesday.
  assert.equal(startOfWeekUtc(new Date('2026-09-08T15:30:00Z')).toISOString(), '2026-09-07T00:00:00.000Z');
  // 2026-09-13 is a Sunday — still the week that began Monday the 7th.
  assert.equal(startOfWeekUtc(new Date('2026-09-13T23:59:59Z')).toISOString(), '2026-09-07T00:00:00.000Z');
  // 2026-09-14 is the next Monday.
  assert.equal(startOfWeekUtc(new Date('2026-09-14T00:00:01Z')).toISOString(), '2026-09-14T00:00:00.000Z');
});
