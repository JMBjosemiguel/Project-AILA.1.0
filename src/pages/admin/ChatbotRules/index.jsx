import { useEffect, useState } from 'react';
import { AlertTriangle, Award, BookOpen, FolderOpen, TrendingDown, TrendingUp } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonList } from '../../../components/common/Skeleton';
import BarChart from '../../../components/analytics/BarChart';
import { getAdminAnalytics } from '../../../services/api/adminService';

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ListCard({ title, subtitle, icon: Icon, items, empty, renderItem }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {items?.length ? (
        <div className="flex flex-col divide-y divide-ink-50">
          {items.map(renderItem)}
        </div>
      ) : (
        <EmptyState icon={Icon} title={empty} message="This will fill in as students use AILA." />
      )}
    </Card>
  );
}

export default function AdminChatbotRulesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getAdminAnalytics()
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
        <SkeletonList count={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load analytics"
            message={error?.message || 'Something went wrong while loading analytics. Please try again.'}
            action={<Button size="sm" variant="outline" onClick={load}>Retry</Button>}
          />
        </Card>
      </div>
    );
  }

  const registrations = data.registrations.map((r) => ({ day: shortDate(r.date), hours: r.count }));
  const aiUsage = data.aiUsage.map((r) => ({ day: shortDate(r.date), hours: r.count }));
  const quizTrend = data.quizTrend.map((r) => ({ day: shortDate(r.date), hours: Number(r.avg_percent) }));
  const lessonCompletions = data.lessonCompletions.map((r) => ({ day: shortDate(r.date), hours: r.count }));

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp flex flex-col gap-5">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="New registrations" subtitle="Last 14 days" />
          {registrations.length ? <BarChart data={registrations} unit="" /> : <EmptyState title="No registrations yet" message="New student sign-ups will appear here." />}
        </Card>
        <Card>
          <CardHeader title="AI conversations" subtitle="Messages sent to AILA, last 14 days" />
          {aiUsage.length ? <BarChart data={aiUsage} unit="" /> : <EmptyState title="No AI activity yet" message="Chat activity will appear here." />}
        </Card>
        <Card>
          <CardHeader title="Average quiz score" subtitle="Platform-wide, last 14 days" />
          {quizTrend.length ? <BarChart data={quizTrend} unit="%" /> : <EmptyState title="No quiz attempts yet" message="Quiz performance will appear here." />}
        </Card>
        <Card>
          <CardHeader title="Lesson completions" subtitle="Last 14 days" />
          {lessonCompletions.length ? <BarChart data={lessonCompletions} unit="" /> : <EmptyState title="No lessons completed yet" message="Completion activity will appear here." />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ListCard
          title="Popular courses" subtitle="Most generated course titles" icon={BookOpen}
          items={data.popularCourses} empty="No courses generated yet"
          renderItem={(c) => (
            <div key={c.name} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-700 truncate">{c.name}</span>
              <span className="text-ink-400 font-semibold flex-shrink-0 ml-2">{c.generations}×</span>
            </div>
          )}
        />
        <ListCard
          title="Popular resources" subtitle="Most viewed files" icon={FolderOpen}
          items={data.popularResources.filter((r) => r.views > 0)} empty="No resource views yet"
          renderItem={(r) => (
            <div key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-700 truncate">{r.title}</span>
              <span className="text-ink-400 font-semibold flex-shrink-0 ml-2">{r.views} views</span>
            </div>
          )}
        />
        <ListCard
          title="Most active students" subtitle="By XP earned" icon={Award}
          items={data.activeStudents.filter((s) => s.xp_points > 0)} empty="No student activity yet"
          renderItem={(s) => (
            <div key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-700 truncate">{s.first_name} {s.last_name}</span>
              <span className="text-ink-400 font-semibold flex-shrink-0 ml-2">{s.xp_points} XP · Lv.{s.level}</span>
            </div>
          )}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ListCard
          title="Strongest topics" subtitle="Highest average progress across students" icon={TrendingUp}
          items={data.strongTopics} empty="No topic progress yet"
          renderItem={(t) => (
            <div key={`${t.subject}-${t.topic}`} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <span className="text-ink-700 truncate block">{t.topic}</span>
                <span className="text-xs text-ink-400">{t.subject}</span>
              </div>
              <span className="text-emerald-600 font-semibold flex-shrink-0 ml-2">{t.avg_percent}%</span>
            </div>
          )}
        />
        <ListCard
          title="Weakest topics" subtitle="Lowest average progress across students" icon={TrendingDown}
          items={data.weakTopics} empty="No topic progress yet"
          renderItem={(t) => (
            <div key={`${t.subject}-${t.topic}`} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <span className="text-ink-700 truncate block">{t.topic}</span>
                <span className="text-xs text-ink-400">{t.subject}</span>
              </div>
              <span className="text-rose-500 font-semibold flex-shrink-0 ml-2">{t.avg_percent}%</span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
