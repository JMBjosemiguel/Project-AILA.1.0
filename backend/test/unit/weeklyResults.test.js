'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const APPTIME_PATH = require.resolve('../../src/utils/appTime');
const DAYBUCKET_PATH = require.resolve('../../src/utils/dayBucket');
const DATABASE_PATH = require.resolve('../../src/config/database');
const MODEL_PATH = require.resolve('../../src/models/adminAnalyticsModel');

// appTime reads APP_TIMEZONE once at load, and dayBucket / the model
// destructure it at require time, so reload all three per timezone.
function loadWith(tz, query) {
  const prev = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = tz;
  for (const path of [APPTIME_PATH, DAYBUCKET_PATH, MODEL_PATH]) delete require.cache[path];
  const prevDb = require.cache[DATABASE_PATH];
  if (query) require.cache[DATABASE_PATH] = { id: DATABASE_PATH, filename: DATABASE_PATH, loaded: true, exports: { query } };
  const mods = {
    appTime: require(APPTIME_PATH),
    dayBucket: require(DAYBUCKET_PATH),
    model: query ? require(MODEL_PATH) : null,
  };
  if (query) {
    if (prevDb) require.cache[DATABASE_PATH] = prevDb;
    else delete require.cache[DATABASE_PATH];
    delete require.cache[MODEL_PATH];
  }
  if (prev === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = prev;
  return mods;
}

test.after(() => {
  for (const path of [APPTIME_PATH, DAYBUCKET_PATH, MODEL_PATH]) delete require.cache[path];
});

test('appWeekStarts: the last 8 Mondays 00:00 in APP_TIMEZONE, ending with the leaderboard week', () => {
  const { appTime } = loadWith('Asia/Manila');
  // Thu 29 Oct 2026, 10:00 Manila.
  const now = new Date('2026-10-29T02:00:00Z');
  const starts = appTime.appWeekStarts(8, now);

  assert.equal(starts.length, 8);
  assert.equal(starts[7].getTime(), appTime.appStartOfWeek(now).getTime(), 'current week = leaderboard week');
  // Monday 26 Oct 00:00 Manila = Sunday 25 Oct 16:00 UTC.
  assert.equal(starts[7].toISOString(), '2026-10-25T16:00:00.000Z');
  assert.equal(starts[0].toISOString(), '2026-09-06T16:00:00.000Z');
  for (let i = 1; i < starts.length; i += 1) {
    assert.equal(starts[i] - starts[i - 1], 7 * 24 * 60 * 60 * 1000, `week ${i} is 7 days after week ${i - 1}`);
  }
});

test('appWeekStarts: in a DST zone each start is still local Monday midnight', () => {
  const { appTime } = loadWith('America/New_York');
  // US DST ends Sun 1 Nov 2026, so this window has a 169-hour week.
  const starts = appTime.appWeekStarts(3, new Date('2026-11-04T15:00:00Z'));
  assert.deepEqual(starts.map((d) => d.toISOString()), [
    '2026-10-19T04:00:00.000Z',
    '2026-10-26T04:00:00.000Z',
    '2026-11-02T05:00:00.000Z',
  ]);
});

test('groupByWeek: a row exactly on a week start belongs to that week, 1 ms earlier to the one before', () => {
  const { dayBucket } = loadWith('UTC');
  const starts = [new Date('2026-10-12T00:00:00Z'), new Date('2026-10-19T00:00:00Z'), new Date('2026-10-26T00:00:00Z')];
  const rows = [
    { ts: new Date('2026-10-11T23:59:59Z'), id: 'before window' },
    { ts: new Date('2026-10-12T00:00:00Z'), id: 'a' },
    { ts: new Date('2026-10-18T23:59:59.999Z'), id: 'b' },
    { ts: new Date('2026-10-19T00:00:00Z'), id: 'c' },
    { ts: '2026-10-29T08:00:00Z', id: 'd' },
  ];
  const weeks = dayBucket.groupByWeek(rows, starts);
  assert.deepEqual(weeks.map((week) => week.map((row) => row.id)), [['a', 'b'], ['c'], ['d']]);
});

test('getWeeklyResults: one row per week with active students, quizzes, raw average, lessons and registrations', async () => {
  const calls = [];
  const fake = async (sql, params) => {
    calls.push({ sql, params });
    if (/dashboard_activity_log/.test(sql)) {
      return [
        { user_id: 1, ts: new Date('2026-10-26T01:00:00Z') },
        { user_id: 1, ts: new Date('2026-10-27T01:00:00Z') }, // same student twice: counted once
        { user_id: 2, ts: new Date('2026-10-28T01:00:00Z') },
        { user_id: 1, ts: new Date('2026-10-20T01:00:00Z') },
      ];
    }
    if (/quiz_attempts/.test(sql)) {
      return [
        { ts: new Date('2026-10-26T02:00:00Z'), score: 3, total: 4 }, // 75%
        { ts: new Date('2026-10-27T02:00:00Z'), score: 1, total: 2 }, // 50%
        { ts: new Date('2026-10-28T02:00:00Z'), score: 0, total: 0 }, // counted, not averaged
      ];
    }
    if (/lesson_progress/.test(sql)) return [{ ts: new Date('2026-10-19T00:00:00Z') }, { ts: new Date('2026-10-29T00:00:00Z') }];
    if (/FROM users/.test(sql)) return [{ ts: new Date('2026-10-25T23:59:59Z') }];
    throw new Error(`unexpected query: ${sql}`);
  };

  const { model, appTime } = loadWith('UTC', fake);
  const now = new Date('2026-10-29T12:00:00Z');
  const rows = await model.getWeeklyResults(8, now);

  assert.equal(rows.length, 8);
  const starts = appTime.appWeekStarts(8, now).map((d) => d.toISOString());
  assert.deepEqual(rows.map((r) => r.weekStart), starts);

  const current = rows[7];
  assert.deepEqual(current, {
    weekStart: '2026-10-26T00:00:00.000Z',
    activeStudents: 2,
    quizzesCompleted: 3,
    avgQuizScore: 63, // (75 + 50) / 2 = 62.5
    lessonsCompleted: 1,
    newRegistrations: 0,
  });
  assert.deepEqual(rows[6], {
    weekStart: '2026-10-19T00:00:00.000Z',
    activeStudents: 1,
    quizzesCompleted: 0,
    avgQuizScore: null,
    lessonsCompleted: 1,
    newRegistrations: 1,
  });
  assert.ok(rows.slice(0, 6).every((r) => r.quizzesCompleted === 0 && r.avgQuizScore === null));

  // Every query starts at the oldest week, and the quiz query keeps chat
  // quizzes and unfinished attempts out.
  assert.ok(calls.every((call) => call.params.some((p) => p instanceof Date && p.toISOString() === starts[0])));
  const quizSql = calls.find((call) => /quiz_attempts/.test(call.sql)).sql;
  assert.match(quizSql, /source_type != 'chat'/);
  assert.match(quizSql, /status = 'submitted'/);
});
