'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const APPTIME_PATH = require.resolve('../../src/utils/appTime');
const DAYBUCKET_PATH = require.resolve('../../src/utils/dayBucket');

// Both modules read/cache APP_TIMEZONE indirectly (dayBucket destructures
// appTime's exports at require time), so reload both together per timezone —
// same pattern as appTime.test.js.
function loadWith(tz) {
  const prev = process.env.APP_TIMEZONE;
  if (tz === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = tz;
  delete require.cache[APPTIME_PATH];
  delete require.cache[DAYBUCKET_PATH];
  const mod = require('../../src/utils/dayBucket');
  if (prev === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = prev;
  return mod;
}

test.after(() => {
  delete require.cache[APPTIME_PATH];
  delete require.cache[DAYBUCKET_PATH];
  require('../../src/utils/dayBucket');
});

test('countByAppDay buckets a UTC+8 early-morning row into the correct local day', () => {
  const { countByAppDay } = loadWith('Asia/Manila');
  // 15:30 UTC on the 8th == 23:30 Manila, still the 8th.
  // 16:30 UTC on the 8th == 00:30 Manila on the 9th — the bug this whole
  // module exists to fix: SQL's DATE(created_at) would bucket both as "the 8th".
  const rows = [
    { ts: new Date('2026-09-08T15:30:00Z') },
    { ts: new Date('2026-09-08T16:30:00Z') },
    { ts: new Date('2026-09-08T17:00:00Z') },
  ];
  assert.deepEqual(countByAppDay(rows, 'ts'), [
    { date: '2026-09-08', count: 1 },
    { date: '2026-09-09', count: 2 },
  ]);
});

test('countByAppDay matches plain UTC grouping when APP_TIMEZONE is UTC', () => {
  const { countByAppDay } = loadWith('UTC');
  const rows = [
    { ts: new Date('2026-09-08T23:59:00Z') },
    { ts: new Date('2026-09-09T00:01:00Z') },
  ];
  assert.deepEqual(countByAppDay(rows, 'ts'), [
    { date: '2026-09-08', count: 1 },
    { date: '2026-09-09', count: 1 },
  ]);
});

test('sumByAppDay sums the value field per app-local day', () => {
  const { sumByAppDay } = loadWith('Asia/Manila');
  const rows = [
    { ts: new Date('2026-09-08T15:30:00Z'), minutes: 20 },
    { ts: new Date('2026-09-08T16:30:00Z'), minutes: 15 },
    { ts: new Date('2026-09-08T17:00:00Z'), minutes: 10 },
  ];
  assert.deepEqual(sumByAppDay(rows, 'ts', 'minutes'), [
    { date: '2026-09-08', value: 20 },
    { date: '2026-09-09', value: 25 },
  ]);
});

test('avgPercentByAppDay averages score/total per app-local day and rounds', () => {
  const { avgPercentByAppDay } = loadWith('UTC');
  const rows = [
    { ts: new Date('2026-09-08T10:00:00Z'), score: 8, total: 10 }, // 80%
    { ts: new Date('2026-09-08T11:00:00Z'), score: 5, total: 10 }, // 50%
    { ts: new Date('2026-09-09T10:00:00Z'), score: 10, total: 10 }, // 100%
  ];
  assert.deepEqual(avgPercentByAppDay(rows, 'ts'), [
    { date: '2026-09-08', avg_percent: 65 },
    { date: '2026-09-09', avg_percent: 100 },
  ]);
});

test('windowStartDays returns the last N app-local calendar dates, oldest first', () => {
  const { windowStartDays } = loadWith('Asia/Manila');
  // "Now" is 2026-09-08T15:30:00Z == 2026-09-08 23:30 Manila.
  const days = windowStartDays(3, new Date('2026-09-08T15:30:00Z'));
  assert.deepEqual(days, ['2026-09-06', '2026-09-07', '2026-09-08']);
});

test('appWindowStart fetches from at or before the real window start (never misses an in-window row)', () => {
  const { appWindowStart } = loadWith('UTC');
  const now = new Date('2026-09-08T15:30:00Z'); // appStartOfDay == 2026-09-08T00:00:00Z
  const realWindowStart = new Date('2026-09-02T00:00:00.000Z'); // today minus 6 days
  assert.ok(appWindowStart(6, now).getTime() <= realWindowStart.getTime());
});

test('windowStartDays filtering drops a row from the fetch buffer day that falls outside the real window', () => {
  const { windowStartDays, countByAppDay } = loadWith('Asia/Manila');
  const now = new Date('2026-09-08T15:30:00Z'); // 2026-09-08 23:30 Manila
  const validDays = new Set(windowStartDays(7, now)); // Manila 09-02 .. 09-08

  // Local midnight Manila on the 2nd (the real window's first valid instant)
  // is 2026-09-01T16:00:00Z — fetched rows at/after this instant belong in
  // the window; one millisecond earlier is still "the 1st" in Manila and
  // must be dropped by the validDays filter even though appWindowStart's
  // buffer pulled it into the raw fetch.
  const inWindowRow = { ts: new Date('2026-09-01T16:00:00.000Z') };
  const bufferDayRow = { ts: new Date('2026-09-01T15:59:59.999Z') };

  const bucketed = countByAppDay([inWindowRow, bufferDayRow], 'ts').filter((r) => validDays.has(r.date));
  assert.deepEqual(bucketed, [{ date: '2026-09-02', count: 1 }]);
});
