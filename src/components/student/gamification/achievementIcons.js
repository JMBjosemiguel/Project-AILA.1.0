import { Award, BookOpen, Flame, GraduationCap, Medal, Star, Target, Trophy } from 'lucide-react';

// Server-controlled allowlist -> React component. The API only ever sends one of
// these keys (migration 006 seed + icon_key ENUM-style validation); anything
// unrecognised falls back to a generic award icon. No DB text is ever rendered
// as markup.
const ACHIEVEMENT_ICONS = {
  book_open: BookOpen,
  trophy: Trophy,
  flame: Flame,
  star: Star,
  graduation_cap: GraduationCap,
  target: Target,
  medal: Medal,
};

export function achievementIcon(iconKey) {
  return ACHIEVEMENT_ICONS[iconKey] || Award;
}

// Muted accent per category, used for the earned badge tint.
export const CATEGORY_ACCENT = {
  learning: { fg: 'text-primary', bg: 'bg-primary-50' },
  course: { fg: 'text-amber-600', bg: 'bg-amber-50' },
  streak: { fg: 'text-rose-600', bg: 'bg-rose-50' },
  level: { fg: 'text-emerald-600', bg: 'bg-emerald-50' },
};
