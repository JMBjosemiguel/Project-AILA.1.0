import Card, { CardHeader } from '../../common/Card';
import EmptyState from '../../common/EmptyState';
import { SkeletonList } from '../../common/Skeleton';
import ProgressBar from '../../common/ProgressBar';
import { DomainDot, domainColor } from '../../common/DomainChip';

export default function CourseProgressCard({ courses = [], loading = false, onViewAll }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Course progress"
        subtitle="Across tracked subjects and topics"
        action={<button onClick={onViewAll} className="text-xs font-semibold text-primary hover:underline">View all</button>}
      />
      {loading ? (
        <SkeletonList count={3} />
      ) : courses.length ? (
        <div className="flex flex-col gap-4">
          {courses.slice(0, 4).map((course) => (
            <div key={course.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <DomainDot subject={course} />
                  <span className="text-sm font-medium text-ink-800 truncate">{course.name}</span>
                </div>
                <span className="text-xs text-ink-400">{course.code}</span>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0 w-32">
                <ProgressBar value={course.progress_percent ?? 0} color={domainColor(course)} className="flex-1" />
                <span className="text-xs font-semibold text-ink-800 w-8 text-right">{course.progress_percent ?? 0}%</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No progress yet" message="Add a course in Learning Hub to start tracking your progress." />
      )}
    </Card>
  );
}
