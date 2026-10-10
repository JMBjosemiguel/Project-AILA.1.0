/**
 * Per-day aggregation helpers that bucket by the APP_TIMEZONE calendar date
 * instead of MySQL's session date (UTC — see config/database.js). Grouping
 * with SQL's `DATE(created_at)` buckets by the connection's UTC day, so for a
 * timezone ahead of UTC (Asia/Manila, UTC+8) anything from local midnight to
 * 8am still falls in the *previous* UTC day and lands in the wrong bucket.
 *
 * The fix fetches raw rows (no SQL-side DATE()/GROUP BY) and re-buckets them
 * here using `appDateStr`, which already resolves a timestamp to its
 * APP_TIMEZONE calendar date correctly.
 */
const { appDateStr, appStartOfDay } = require('./appTime');

// The UTC instant to fetch rows from so that, after re-bucketing by
// APP_TIMEZONE below, the real "last N app-local calendar days" window
// (today plus the `daysAgo` days before it) is fully covered. The extra day
// of buffer absorbs the gap between MySQL's session-UTC CURDATE() and the
// app-timezone day boundary — `windowStartDays` below trims it back off.
function appWindowStart(daysAgo, instant = new Date()) {
  return new Date(appStartOfDay(instant).getTime() - (daysAgo + 1) * 24 * 60 * 60 * 1000);
}

// The set of 'YYYY-MM-DD' (app timezone) calendar dates in the last `days`
// days up to and including today, oldest first.
function windowStartDays(days, instant = new Date()) {
  const today = appStartOfDay(instant);
  const result = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    result.push(appDateStr(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return result;
}

// Groups rows by their APP_TIMEZONE calendar date and counts them.
// `rows`: array of objects with a timestamp at `tsKey`. Returns
// `{ date, count }` rows, oldest first, omitting days with zero rows.
function countByAppDay(rows, tsKey = 'ts') {
  const counts = new Map();
  for (const row of rows) {
    const day = appDateStr(row[tsKey]);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, count]) => ({ date, count }));
}

// Groups rows by their APP_TIMEZONE calendar date and sums `valueKey`.
// Returns `{ date, value }` rows, oldest first, omitting days with no rows.
function sumByAppDay(rows, tsKey, valueKey) {
  const sums = new Map();
  for (const row of rows) {
    const day = appDateStr(row[tsKey]);
    sums.set(day, (sums.get(day) || 0) + Number(row[valueKey] || 0));
  }
  return [...sums.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

// Groups rows by their APP_TIMEZONE calendar date and averages
// `(row.score / row.total) * 100`, rounded. Returns `{ date, avg_percent }`
// rows, oldest first, omitting days with no rows.
function avgPercentByAppDay(rows, tsKey = 'ts') {
  const byDay = new Map();
  for (const row of rows) {
    const day = appDateStr(row[tsKey]);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push((Number(row.score) / Number(row.total)) * 100);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, scores]) => ({
      date,
      avg_percent: Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length),
    }));
}

module.exports = {
  appWindowStart,
  windowStartDays,
  countByAppDay,
  sumByAppDay,
  avgPercentByAppDay,
};
