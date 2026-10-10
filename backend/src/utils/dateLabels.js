const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// `date` is a 'YYYY-MM-DD' calendar date (already resolved to the app
// timezone by the caller) — parsed from its components via Date.UTC so the
// weekday never shifts with the server process's own local timezone, the
// same trap `new Date(date).getDay()` falls into.
function weekdayLabel(date) {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
  return WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

module.exports = {
  WEEKDAY_LABELS,
  weekdayLabel,
};
