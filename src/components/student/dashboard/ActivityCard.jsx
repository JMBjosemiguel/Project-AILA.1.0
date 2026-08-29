import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonList } from '../../common/Skeleton';

export default function ActivityCard({ activities = [], loading = false }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Recent activity" />
      {loading ? (
        <SkeletonList count={3} />
      ) : activities.length ? (
        <div className="flex flex-col gap-3.5">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center text-sm flex-shrink-0">
                {activity.activity_type?.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-ink-800 leading-snug">{activity.description}</p>
                <span className="text-xs text-ink-400">{new Date(activity.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No recent activity" message="Complete a lesson or quiz to see your activity here." />
      )}
    </Card>
  );
}
