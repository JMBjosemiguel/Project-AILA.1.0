import { CheckCircle2 } from 'lucide-react';
import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';

// The student's lowest quiz-average topics (server: studentContextService
// getWeakTopics, top 3). Same styling as Analytics' "Topics to review".
export default function WeakTopicsCard({ topics = [], onViewAll }) {
  return (
    <Card>
      <CardHeader
        title="Weak topics"
        subtitle="Lowest quiz averages"
        action={<button onClick={onViewAll} className="text-xs font-semibold text-primary hover:underline">Analytics</button>}
      />
      {topics.length ? (
        <div className="flex flex-col gap-2.5">
          {topics.map((topic) => (
            <div key={topic.topicId} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="text-ink-700 truncate">{topic.topic}</p>
                {topic.subject && <p className="text-xs text-ink-400 truncate">{topic.subject}</p>}
              </div>
              <span className="text-amber-600 font-semibold flex-shrink-0">{topic.avgPercent}%</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={CheckCircle2} title="No weak topics" message="Topics with a low quiz average will show up here." />
      )}
    </Card>
  );
}
