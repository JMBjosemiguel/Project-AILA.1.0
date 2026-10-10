'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { weekdayLabel } = require('../../src/utils/dateLabels');

test('weekdayLabel resolves a calendar date from its own components', () => {
  // 2026-09-08 is a Tuesday.
  assert.equal(weekdayLabel('2026-09-08'), 'Tue');
  assert.equal(weekdayLabel('2026-09-13'), 'Sun');
});

test('weekdayLabel ignores any time-of-day component instead of re-parsing it', () => {
  // Must read only the calendar date, not reinterpret the full timestamp in
  // the server process's own local timezone (the bug this guards against —
  // `new Date(str).getDay()` depends on that timezone).
  assert.equal(weekdayLabel('2026-09-08T00:00:00.000Z'), 'Tue');
  assert.equal(weekdayLabel('2026-09-08T23:59:59.999Z'), 'Tue');
});
