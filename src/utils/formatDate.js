// Shared date/time formatting so every page shows dates the same way,
// regardless of the browser's locale. Use these instead of calling
// toLocaleString()/toLocaleDateString() directly. For "5m ago"-style
// relative time, keep using whatever is already used for that — these
// two cover the absolute-date cases.

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${formatDate(value)}, ${timePart}`;
}
