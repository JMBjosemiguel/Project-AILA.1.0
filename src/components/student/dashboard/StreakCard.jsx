import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonBlock } from '../../common/Skeleton';

const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function StreakCard({ streak, loading = false }) {
  return (
    <Card>
      <CardHeader title="Study streak" action={streak && <span className="text-sm font-bold text-ink-800">{streak.current_streak} days</span>} />
      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {week.map((day, index) => <SkeletonBlock key={`${day}-${index}`} className="aspect-square rounded-md" />)}
        </div>
      ) : streak ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold text-ink-400 mb-1.5">
            {week.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {week.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="aspect-square rounded-md"
                style={{ background: index < Math.min(streak.current_streak, 7) ? '#2563EB' : '#F1F5F9' }}
              />
            ))}
          </div>
          <p className="text-xs text-ink-400 leading-relaxed mt-3">
            Longest streak: <strong className="text-ink-600">{streak.longest_streak}</strong> days.
          </p>
        </>
      ) : (
        <EmptyState title="No streak yet" message="Study today to start building your streak." />
      )}
    </Card>
  );
}
