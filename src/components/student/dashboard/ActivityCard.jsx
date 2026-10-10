import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonList } from '../../common/Skeleton';
import ActivityList from '../ActivityList';

export default function ActivityCard({ activities = [], loading = false }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Recent activity" />
      {loading ? (
        <SkeletonList count={3} />
      ) : activities.length ? (
        <ActivityList activities={activities} />
      ) : (
        <EmptyState title="No recent activity" message="Complete a lesson or quiz to see your activity here." />
      )}
    </Card>
  );
}
