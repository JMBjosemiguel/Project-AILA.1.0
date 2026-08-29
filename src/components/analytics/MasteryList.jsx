import ProgressBar from '../common/ProgressBar';
import EmptyState from '../common/EmptyState';

export default function MasteryList({ data }) {
  if (!data.length) {
    return <EmptyState title="No mastery records" message="Learning progress rows will appear after topics are tracked." />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {data.map((m) => (
        <div key={m.subject} className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-700 w-28 flex-shrink-0 truncate">{m.subject}</span>
          <ProgressBar value={m.pct} color={m.color} className="flex-1" />
          <span className="text-sm font-semibold text-ink-800 w-9 text-right flex-shrink-0">{m.pct}%</span>
        </div>
      ))}
    </div>
  );
}
