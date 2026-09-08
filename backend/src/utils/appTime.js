/**
 * Application-timezone calendar helpers.
 *
 * AILA has no per-user timezone. Streaks and the weekly leaderboard need a single
 * "what day / week is it" rule that matches how students actually experience the
 * product, not raw UTC (a UTC+8 student would otherwise see the day roll over at
 * 08:00 local).
 *
 * The timezone is configured, never hard-coded: `APP_TIMEZONE` (an IANA name like
 * `Asia/Manila`). An unset or invalid value falls back to `UTC` — safe, and the
 * pre-migration behaviour — rather than throwing on every streak update.
 *
 * All server records still store/compare timestamps in UTC; these helpers only
 * decide which UTC instant a local "day" or "week" begins at.
 */
const RAW_APP_TIMEZONE = process.env.APP_TIMEZONE || 'UTC';

const APP_TIMEZONE = (() => {
  try {
    // Throws RangeError for an unknown time zone.
    new Intl.DateTimeFormat('en-CA', { timeZone: RAW_APP_TIMEZONE });
    return RAW_APP_TIMEZONE;
  } catch {
    return 'UTC';
  }
})();

function asDate(value) {
  return value instanceof Date ? value : new Date(value);
}

// 'YYYY-MM-DD' — the calendar date of `instant` in the application timezone.
// en-CA locale formats dates as YYYY-MM-DD.
function appDateStr(instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(asDate(instant));
}

// The application-timezone calendar date exactly one day before `instant`.
// (Subtracting 24h is exact for fixed-offset zones; within the rare ~1h DST
// transition window it can be off by an hour — acceptable for a streak, and
// Asia/Manila, the intended default, has no DST.)
function appYesterdayStr(instant = new Date()) {
  return appDateStr(asDate(instant).getTime() - 24 * 60 * 60 * 1000);
}

// Minutes that the application timezone is ahead of UTC at `instant`
// (e.g. +480 for Asia/Manila).
function tzOffsetMinutes(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});
  const wallClockAsUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second
  );
  return Math.round((wallClockAsUtc - instant.getTime()) / 60000);
}

// The UTC instant of 00:00 (application timezone) on the given local calendar date.
function localMidnightUtc(year, month, day) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
}

/**
 * The UTC instant at which the current ISO week (starting Monday 00:00 in the
 * application timezone) began. Compare directly against a UTC `created_at`.
 */
function appStartOfWeek(instant = new Date()) {
  const [year, month, day] = appDateStr(instant).split('-').map(Number);
  // Weekday of the local calendar date — derived from a UTC noon anchor so a DST
  // shift can't move it across midnight.
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceMonday);
  return localMidnightUtc(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate());
}

module.exports = {
  APP_TIMEZONE,
  appDateStr,
  appYesterdayStr,
  appStartOfWeek,
};
