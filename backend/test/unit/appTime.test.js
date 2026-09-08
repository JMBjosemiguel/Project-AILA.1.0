'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const APPTIME_PATH = require.resolve('../../src/utils/appTime');

// appTime reads APP_TIMEZONE once at module load, so reload it per timezone.
function loadWith(tz) {
  const prev = process.env.APP_TIMEZONE;
  if (tz === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = tz;
  delete require.cache[APPTIME_PATH];
  const mod = require('../../src/utils/appTime');
  if (prev === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = prev;
  return mod;
}

test.after(() => { delete require.cache[APPTIME_PATH]; require('../../src/utils/appTime'); });

test('default (no APP_TIMEZONE) behaves as UTC calendar', () => {
  const t = loadWith(undefined);
  assert.equal(t.APP_TIMEZONE, 'UTC');
  assert.equal(t.appDateStr(new Date('2026-09-08T23:59:00Z')), '2026-09-08');
  assert.equal(t.appDateStr(new Date('2026-09-09T00:01:00Z')), '2026-09-09');
});

test('an invalid APP_TIMEZONE falls back to UTC instead of throwing', () => {
  const t = loadWith('Not/AZone');
  assert.equal(t.APP_TIMEZONE, 'UTC');
  assert.equal(t.appDateStr(new Date('2026-09-08T12:00:00Z')), '2026-09-08');
});

test('Asia/Manila (UTC+8) rolls the calendar day over at local midnight', () => {
  const t = loadWith('Asia/Manila');
  assert.equal(t.APP_TIMEZONE, 'Asia/Manila');
  // 15:30 UTC == 23:30 the same day in Manila
  assert.equal(t.appDateStr(new Date('2026-09-08T15:30:00Z')), '2026-09-08');
  // 16:00 UTC == 00:00 the NEXT day in Manila — the boundary
  assert.equal(t.appDateStr(new Date('2026-09-08T16:00:00Z')), '2026-09-09');
  assert.equal(t.appDateStr(new Date('2026-09-08T16:01:00Z')), '2026-09-09');
});

test('appYesterdayStr is the local calendar date one day earlier', () => {
  const utc = loadWith('UTC');
  assert.equal(utc.appYesterdayStr(new Date('2026-09-09T00:30:00Z')), '2026-09-08');

  const mnl = loadWith('Asia/Manila');
  // 00:30 UTC == 08:30 Manila on the 9th -> yesterday is the 8th
  assert.equal(mnl.appYesterdayStr(new Date('2026-09-09T00:30:00Z')), '2026-09-08');
  // 16:30 UTC on the 8th == 00:30 Manila on the 9th -> yesterday is the 8th
  assert.equal(mnl.appYesterdayStr(new Date('2026-09-08T16:30:00Z')), '2026-09-08');
});

test('appStartOfWeek returns Monday 00:00 (app tz) as a UTC instant', () => {
  // 2026-09-08 is a Tuesday.
  const utc = loadWith('UTC');
  assert.equal(utc.appStartOfWeek(new Date('2026-09-08T15:30:00Z')).toISOString(), '2026-09-07T00:00:00.000Z');
  // Sunday 2026-09-13 still belongs to the week that began Monday the 7th.
  assert.equal(utc.appStartOfWeek(new Date('2026-09-13T23:00:00Z')).toISOString(), '2026-09-07T00:00:00.000Z');

  const mnl = loadWith('Asia/Manila');
  // Monday 2026-09-07 00:00 Manila == 2026-09-06 16:00 UTC
  assert.equal(mnl.appStartOfWeek(new Date('2026-09-08T15:30:00Z')).toISOString(), '2026-09-06T16:00:00.000Z');
  // Just after the local Monday boundary — same week start
  assert.equal(mnl.appStartOfWeek(new Date('2026-09-06T16:30:00Z')).toISOString(), '2026-09-06T16:00:00.000Z');
  // Just before it — previous week
  assert.equal(mnl.appStartOfWeek(new Date('2026-09-06T15:30:00Z')).toISOString(), '2026-08-30T16:00:00.000Z');
});
