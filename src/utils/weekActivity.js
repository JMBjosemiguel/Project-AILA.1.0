const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The dashboard API only returns rows for days that actually have activity
// (grouped by date, no zero-fill), covering a rolling 7-day window ending
// today. This rebuilds the full 7 days in order, filling gaps with count 0,
// so every consumer (the weekly bar chart, the streak grid) shows a real day
// for each of the last 7 days instead of only the ones with data.
export function buildWeekDays(weeklyActivity) {
  const countByDay = new Map((weeklyActivity ?? []).map((entry) => [entry.day, entry.count]));
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const label = WEEKDAY_LABELS[date.getDay()];
    days.push({ day: label, count: countByDay.get(label) ?? 0, isToday: i === 0 });
  }
  return days;
}
