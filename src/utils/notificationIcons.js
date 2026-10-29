import { Award, Bell, CalendarClock, ClipboardCheck, Megaphone, Sparkles, TrendingUp } from 'lucide-react';

// The DB only has 4 notification types (announcement/reminder/assignment_alert/
// system) — "quiz scored", "level up" and "achievement unlocked" all share
// type='system', distinguished only by their title (see backend quizService,
// gamification.js, achievementService.js). Matched by title FIRST, so these
// three get their own icon before falling through to the generic per-type one.
// ClipboardCheck for quizzes (as in src/utils/activityIcons.js); progress icons
// are kept calm (TrendingUp, Award) rather than game-like. Titles are now
// "Progress: Level N reached" and "Achievement earned"; the older "Level up!" /
// "Achievement unlocked" titles already in the feed still match.
const TITLE_ICON_RULES = [
  { test: (title) => /quiz scored|checkpoint|course final/i.test(title), icon: ClipboardCheck, color: 'text-primary bg-primary-50' },
  { test: (title) => /level up|level \d+ reached/i.test(title), icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  { test: (title) => /achievement (unlocked|earned)/i.test(title), icon: Award, color: 'text-amber-600 bg-amber-50' },
];

const TYPE_ICON = {
  announcement: { icon: Megaphone, color: 'text-primary bg-primary-50' },
  reminder: { icon: CalendarClock, color: 'text-amber-600 bg-amber-50' },
  assignment_alert: { icon: CalendarClock, color: 'text-amber-600 bg-amber-50' },
  system: { icon: Sparkles, color: 'text-ink-500 bg-ink-50' },
};

const FALLBACK = { icon: Bell, color: 'text-ink-400 bg-ink-50' };

export function notificationIconMeta(notification) {
  const title = notification?.title || '';
  const byTitle = TITLE_ICON_RULES.find((rule) => rule.test(title));
  if (byTitle) return byTitle;
  return TYPE_ICON[notification?.type] || FALLBACK;
}
