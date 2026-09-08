import { Lock } from 'lucide-react';
import ProgressBar from '../../common/ProgressBar';
import { achievementIcon, CATEGORY_ACCENT } from './achievementIcons';

// Progress label for a countable achievement ("7 / 10 lessons"). Binary
// achievements pass progress = null and get no bar.
function progressLabel(category, progress) {
  if (!progress || !progress.target) return null;
  const unit = category === 'streak' ? 'day' : category === 'level' ? 'Level' : 'lesson';
  const current = Math.min(progress.current, progress.target);
  if (unit === 'Level') return `Level ${current} / ${progress.target}`;
  return `${current} / ${progress.target} ${unit}${progress.target === 1 ? '' : 's'}`;
}

export default function AchievementBadge({ achievement, earned = false, earnedAt = null }) {
  const Icon = achievementIcon(achievement.iconKey);
  const accent = CATEGORY_ACCENT[achievement.category] || CATEGORY_ACCENT.learning;
  const label = progressLabel(achievement.category, achievement.progress);
  const pct = label && achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : 0;

  return (
    <div
      className={[
        'flex gap-3 rounded-2xl border p-4 transition-colors',
        earned ? 'border-ink-100 bg-white' : 'border-dashed border-ink-100 bg-ink-50/40',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
          earned ? accent.bg : 'bg-ink-100',
        ].join(' ')}
      >
        {earned ? <Icon size={20} className={accent.fg} /> : <Lock size={16} className="text-ink-300" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={['truncate text-sm font-semibold', earned ? 'text-ink-800' : 'text-ink-500'].join(' ')}>
            {achievement.name}
          </p>
          {achievement.xpReward > 0 && (
            <span className={['flex-shrink-0 text-[0.7rem] font-semibold', earned ? 'text-primary' : 'text-ink-300'].join(' ')}>
              +{achievement.xpReward} XP
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-400">{achievement.description}</p>

        {earned && earnedAt && (
          <p className="mt-1.5 text-[0.7rem] font-medium text-emerald-600">
            Earned {new Date(earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}

        {!earned && label && (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={pct} className="flex-1" height={5} />
            <span className="flex-shrink-0 text-[0.7rem] font-medium text-ink-400">{label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
