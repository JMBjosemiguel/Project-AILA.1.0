import { ArrowRight, Trophy } from 'lucide-react';
import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonBlock } from '../../common/Skeleton';
import { achievementIcon, CATEGORY_ACCENT } from '../gamification/achievementIcons';

function Row({ achievement, muted = false }) {
  const Icon = achievementIcon(achievement.iconKey);
  const accent = CATEGORY_ACCENT[achievement.category] || CATEGORY_ACCENT.learning;
  const progress = achievement.progress;

  return (
    <div className="flex items-center gap-2.5">
      <div className={['flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', muted ? 'bg-ink-100' : accent.bg].join(' ')}>
        <Icon size={15} className={muted ? 'text-ink-300' : accent.fg} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={['truncate text-sm font-medium', muted ? 'text-ink-500' : 'text-ink-800'].join(' ')}>{achievement.name}</p>
        {muted && progress && progress.target ? (
          <p className="text-[0.7rem] text-ink-400">{Math.min(progress.current, progress.target)} / {progress.target}</p>
        ) : (
          <p className="truncate text-[0.7rem] text-ink-400">{achievement.description}</p>
        )}
      </div>
    </div>
  );
}

export default function AchievementsPreviewCard({ summary, loading = false, onNavigate }) {
  const recent = summary?.recentAchievements ?? [];
  const next = summary?.nextAchievements ?? [];

  return (
    <Card>
      <CardHeader
        title="Achievements"
        action={
          <button onClick={() => onNavigate('achievements')} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            View all <ArrowRight size={12} />
          </button>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
        </div>
      ) : recent.length === 0 && next.length === 0 ? (
        <EmptyState icon={Trophy} title="No badges yet" message="Complete a lesson or quiz to earn your first." />
      ) : (
        <div className="flex flex-col gap-3">
          {recent.slice(0, 3).map((a) => <Row key={a.slug} achievement={a} />)}
          {recent.length === 0 && next.slice(0, 3).map((a) => <Row key={a.slug} achievement={a} muted />)}
          {recent.length > 0 && next.length > 0 && (
            <>
              <p className="pt-1 text-[0.7rem] font-bold uppercase tracking-wider text-ink-300">Up next</p>
              {next.slice(0, 2).map((a) => <Row key={a.slug} achievement={a} muted />)}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
