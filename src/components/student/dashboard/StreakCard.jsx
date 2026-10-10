import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonBlock } from '../../common/Skeleton';
import { buildWeekDays } from '../../../utils/weekActivity';

const SKELETON_CELLS = [0, 1, 2, 3, 4, 5, 6];

export default function StreakCard({ streak, weeklyActivity, loading = false }) {
  const days = buildWeekDays(weeklyActivity);
  return (
    <Card>
      <CardHeader
        title="Study streak"
        action={streak && (
          <span className="text-sm font-bold text-ink-800">
            {streak.current_streak} day{streak.current_streak === 1 ? '' : 's'}
          </span>
        )}
      />
      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {SKELETON_CELLS.map((index) => <SkeletonBlock key={index} className="aspect-square rounded-md" />)}
        </div>
      ) : streak ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold text-ink-400 mb-1.5">
            {days.map((entry, index) => <span key={`${entry.day}-${index}`}>{entry.day[0]}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((entry, index) => (
              <div
                key={`${entry.day}-${index}`}
                className="aspect-square rounded-md"
                style={{ background: entry.count > 0 ? '#2563EB' : '#F1F5F9' }}
              />
            ))}
          </div>
          <p className="text-xs text-ink-400 leading-relaxed mt-3">
            Longest streak: <strong className="text-ink-600">{streak.longest_streak}</strong> day{streak.longest_streak === 1 ? '' : 's'}.
          </p>
        </>
      ) : (
        <EmptyState title="No streak yet" message="Study today to start building your streak." />
      )}
    </Card>
  );
}
