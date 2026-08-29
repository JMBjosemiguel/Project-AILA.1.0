const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayLabel(date) {
  return WEEKDAY_LABELS[new Date(date).getDay()];
}

module.exports = {
  WEEKDAY_LABELS,
  weekdayLabel,
};
