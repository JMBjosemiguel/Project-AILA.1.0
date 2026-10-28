// Display-only grade: (score ÷ total × 50) + 50, rounded — 0 correct is 50,
// all correct is 100. Grading, passing scores, XP and analytics keep using the
// raw score percentage; this is never sent to the server.
export function gradePercent(score, total) {
  const max = Number(total);
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.round((Number(score) / max) * 50 + 50);
}
