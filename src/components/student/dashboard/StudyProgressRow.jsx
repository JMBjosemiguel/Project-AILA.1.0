import { ArrowRight, Award, CalendarCheck2, TrendingUp } from 'lucide-react';
import ProgressBar from '../../common/ProgressBar';
import { SkeletonBlock } from '../../common/Skeleton';
import { SHOW_GAMIFICATION } from '../../../constants/studentFeatures';

// Mirrors the server's gamification helper: level = floor(xp / 100) + 1, so each
// level is a flat 100 XP and "progress into this level" is xp - (level - 1) * 100.
const XP_PER_LEVEL = 100;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Streak and achievements (plus level and XP while gamification is shown) in
// one compact row near the bottom of the dashboard. The full view stays on
// the Achievements / Study milestones page.
export default function StudyProgressRow({ profile, streak, summary, loading = false, onNavigate, showGamification = SHOW_GAMIFICATION }) {
  if (loading) return <SkeletonBlock className="mt-5 h-12 w-full rounded-2xl" />;

  const xp = Math.max(0, Math.round(Number(profile?.xp_points) || 0));
  const level = profile?.level || Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp - (level - 1) * XP_PER_LEVEL;
  const pct = Math.min(100, Math.max(0, xpIntoLevel));
  const currentStreak = Number(streak?.current_streak) || 0;
  const bestStreak = Number(streak?.longest_streak) || 0;
  const latest = summary?.recentAchievements?.[0];

  return (
    <section
      aria-label="Your progress"
      className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-2xl border border-ink-100 bg-surface px-5 py-3 text-sm text-ink-600"
    >
      <span className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-400">Your progress</span>

      {showGamification && (
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-ink-400 flex-shrink-0" />
          <span className="whitespace-nowrap">Level {level} &middot; {xpIntoLevel}/{XP_PER_LEVEL} XP</span>
          <div className="w-20 flex-shrink-0"><ProgressBar value={pct} height={6} /></div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <CalendarCheck2 size={14} className="text-ink-400 flex-shrink-0" />
        <span className="whitespace-nowrap">
          Study streak: {plural(currentStreak, 'day')} <span className="text-ink-400">(best {bestStreak})</span>
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Award size={14} className="text-ink-400 flex-shrink-0" />
        <span className="truncate">
          {summary
            ? `${summary.achievementCount ?? 0} of ${summary.totalAchievements ?? 0} ${showGamification ? 'achievements' : 'study milestones'}`
            : (showGamification ? 'Achievements' : 'Study milestones')}
          {latest && <span className="text-ink-400"> &middot; Latest: {latest.name}</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('achievements')}
        className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        View progress <ArrowRight size={12} />
      </button>
    </section>
  );
}
