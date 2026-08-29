import Card, { CardHeader } from '../../common/Card';
import { DomainDot } from '../../common/DomainChip';
import EmptyState from '../../common/EmptyState';
import { SkeletonList } from '../../common/Skeleton';

const PRIORITY_STYLE = {
  high: 'bg-rose-50 text-rose-600',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-ink-50 text-ink-400',
};

export default function DeadlinesCard({ deadlines = [], loading = false, onViewAll }) {
  return (
    <Card>
      <CardHeader
        title="Upcoming deadlines"
        action={<button onClick={onViewAll} className="text-xs font-semibold text-primary hover:underline">Planner</button>}
      />
      {loading ? (
        <SkeletonList count={3} />
      ) : deadlines.length ? (
        <div className="flex flex-col gap-1">
          {deadlines.map((deadline) => (
            <div key={deadline.id} className="flex items-center gap-2.5 py-2 border-b border-ink-50 last:border-0">
              <DomainDot subject={deadline.subject} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-800 truncate">{deadline.title}</p>
                <span className="text-xs text-ink-400">Due {new Date(deadline.deadline).toLocaleDateString()}</span>
              </div>
              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${PRIORITY_STYLE[deadline.priority_label?.toLowerCase()] ?? PRIORITY_STYLE.low}`}>
                {deadline.priority_label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No upcoming deadlines" message="Add a task with a deadline in Study Planner to see it here." />
      )}
    </Card>
  );
}
