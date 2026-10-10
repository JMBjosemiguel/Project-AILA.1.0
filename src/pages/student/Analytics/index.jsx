import { useState } from 'react';
import { Award, BarChart3, BookOpenCheck, Clock, Flame, MessageCircle, TrendingUp, Zap } from 'lucide-react';
import BarChart from '../../../components/analytics/BarChart';
import DonutChart from '../../../components/analytics/DonutChart';
import MasteryList from '../../../components/analytics/MasteryList';
import TrendLine from '../../../components/analytics/TrendLine';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import LoadError from '../../../components/common/LoadError';
import StatCard from '../../../components/common/StatCard';
import { SkeletonStat } from '../../../components/common/Skeleton';
import { useAnalyticsData } from '../../../hooks/useAnalyticsData';

// KPIs come from the API as plain label/value pairs; map labels to icons here
// (same labels/icons as the student Dashboard's stat cards, for consistency).
const KPI_ICONS = {
  'Completed Lessons': BookOpenCheck,
  'Avg Quiz Score': BarChart3,
  'Study Streak': Flame,
  'XP / Level': Zap,
};

export default function AnalyticsPage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading, error } = useAnalyticsData(refreshVersion);
  const kpis = data?.kpis ?? [];
  const studyHours = data?.studyHours ?? [];
  const chatbotUsage = data?.chatbotUsage ?? [];
  const performanceTrend = data?.performanceTrend ?? [];
  const strongTopics = data?.strongTopics ?? [];
  const weakTopics = data?.weakTopics ?? [];
  const xpOverTime = data?.xpOverTime ?? [];
  const resourceUsage = data?.resourceUsage ?? [];

  if (!loading && error) {
    return (
      <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp">
        <LoadError
          title="Couldn't load your analytics"
          message={error.message || 'Something went wrong loading your analytics.'}
          onRetry={() => setRefreshVersion((version) => version + 1)}
        />
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <SkeletonStat key={index} />)
        ) : kpis.length ? kpis.map((kpi) => <StatCard key={kpi.label} {...kpi} icon={KPI_ICONS[kpi.label]} />) : (
          <div className="col-span-2 lg:col-span-4">
            <EmptyState title="No analytics yet" message="Study activity, quizzes, and tasks will show up here as you use AILA." />
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Study hours this week" />
          {studyHours.length ? <BarChart data={studyHours} /> : <EmptyState icon={Clock} title="No study hours logged" message="Study session tracking isn't available yet, so this chart stays empty for now." />}
        </Card>

        <Card>
          <CardHeader title="Subject mastery" />
          <MasteryList data={data?.mastery ?? []} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Weekly performance trend" />
          {performanceTrend.length ? <TrendLine points={performanceTrend} maxValue={100} /> : <EmptyState icon={TrendingUp} title="No trend data" message="Take a few quizzes to see your performance trend over time." />}
        </Card>

        <Card>
          <CardHeader title="AILA usage breakdown" />
          {chatbotUsage.length ? <DonutChart data={chatbotUsage} /> : <EmptyState icon={MessageCircle} title="No AILA usage yet" message="Chat with AILA to see how you're using it here." />}
        </Card>

        <Card>
          <CardHeader title="Strong topics" />
          {strongTopics.length ? (
            <div className="flex flex-col gap-2.5">
              {strongTopics.map((topic) => (
                <div key={topic.topic} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700 truncate min-w-0">{topic.topic}</span>
                  <span className="text-emerald-600 font-semibold flex-shrink-0">{topic.pct}%</span>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Award} title="No data yet" message="Complete lessons to see your strongest topics." />}
        </Card>

        <Card>
          <CardHeader title="Topics to review" />
          {weakTopics.length ? (
            <div className="flex flex-col gap-2.5">
              {weakTopics.map((topic) => (
                <div key={topic.topic} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700 truncate min-w-0">{topic.topic}</span>
                  <span className="text-amber-600 font-semibold flex-shrink-0">{topic.pct}%</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No data yet" message="Weak topics will surface here once progress is tracked." />}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="XP over time" />
          {xpOverTime.length ? <TrendLine points={xpOverTime} color="#D97706" unit=" XP" /> : <EmptyState icon={Zap} title="No XP data yet" message="Completing lessons and quizzes earns XP tracked here." />}
        </Card>

        <Card>
          <CardHeader title="Resource usage" />
          {resourceUsage.length ? <DonutChart data={resourceUsage} /> : <EmptyState title="No resource views" message="Open resources from the library to see usage here." />}
        </Card>
      </div>
    </div>
  );
}
