import { Bell, CalendarClock, ClipboardCheck, Megaphone, Sparkles, Trophy, Zap } from 'lucide-react';

// The DB only has 4 notification types (announcement/reminder/assignment_alert/
// system) — "quiz scored", "level up" and "achievement unlocked" all share
// type='system', distinguished only by their title (see backend quizService,
// gamification.js, achievementService.js). Matched by title FIRST, so these
// three get their own icon before falling through to the generic per-type one.
// Icons/colors mirror the existing conventions already used elsewhere:
// ClipboardCheck for quizzes and Zap for XP (src/utils/activityIcons.js),
// Trophy for achievements (src/components/student/gamification/achievementIcons.js).
const TITLE_ICON_RULES = [
  { test: (title) => /quiz scored|checkpoint|course final/i.test(title), icon: ClipboardCheck, color: 'text-primary bg-primary-50' },
  { test: (title) => /level up/i.test(title), icon: Zap, color: 'text-emerald-600 bg-emerald-50' },
  { test: (title) => /achievement unlocked/i.test(title), icon: Trophy, color: 'text-amber-600 bg-amber-50' },
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
