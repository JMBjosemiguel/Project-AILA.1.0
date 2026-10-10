import ProgressBar from '../common/ProgressBar';
import EmptyState from '../common/EmptyState';

export default function MasteryList({ data }) {
  if (!data.length) {
    return <EmptyState title="No mastery records" message="Learning progress rows will appear after topics are tracked." />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {data.map((m) => (
        <div key={m.subject} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span title={m.subject} className="text-sm font-medium text-ink-700 truncate min-w-0">{m.subject}</span>
            <span className="text-sm font-semibold text-ink-800 flex-shrink-0">{m.pct}%</span>
          </div>
          <ProgressBar value={m.pct} color={m.color} />
        </div>
      ))}
    </div>
  );
}
