import { Award, Clock, MessageCircle, TrendingUp, Zap } from 'lucide-react';
import BarChart from '../../../components/analytics/BarChart';
import DonutChart from '../../../components/analytics/DonutChart';
import MasteryList from '../../../components/analytics/MasteryList';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import StatCard from '../../../components/common/StatCard';
import { SkeletonStat } from '../../../components/common/Skeleton';
import { useAnalyticsData } from '../../../hooks/useAnalyticsData';

export default function AnalyticsPage() {
  const { data, loading } = useAnalyticsData();
  const kpis = data?.kpis ?? [];
  const studyHours = data?.studyHours ?? [];
  const chatbotUsage = data?.chatbotUsage ?? [];
  const performanceTrend = data?.performanceTrend ?? [];
  const strongTopics = data?.strongTopics ?? [];
  const weakTopics = data?.weakTopics ?? [];
  const xpOverTime = data?.xpOverTime ?? [];
  const resourceUsage = data?.resourceUsage ?? [];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <SkeletonStat key={index} />)
        ) : kpis.length ? kpis.map((kpi) => <StatCard key={kpi.label} {...kpi} />) : (
          <div className="col-span-2 lg:col-span-4">
            <EmptyState title="No analytics yet" message="Study activity, quizzes, and tasks will show up here as you use AILA." />
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Study hours this week" />
          {studyHours.length ? <BarChart data={studyHours} /> : <EmptyState icon={Clock} title="No study sessions logged" message="Start a study session to see your weekly hours here." />}
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
                  <span className="text-ink-700 truncate">{topic.topic}</span>
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
                  <span className="text-ink-700 truncate">{topic.topic}</span>
                  <span className="text-amber-600 font-semibold flex-shrink-0">{topic.pct}%</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No data yet" message="Weak topics will surface here once progress is tracked." />}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="XP over time" />
          {xpOverTime.length ? <TrendLine points={xpOverTime} color="#D97706" /> : <EmptyState icon={Zap} title="No XP data yet" message="Completing lessons and quizzes earns XP tracked here." />}
        </Card>

        <Card>
          <CardHeader title="Resource usage" />
          {resourceUsage.length ? <DonutChart data={resourceUsage} /> : <EmptyState title="No resource views" message="Open resources from the library to see usage here." />}
        </Card>
      </div>
    </div>
  );
}

function TrendLine({ points, color = '#2563EB', maxValue = null }) {
  const values = points.map((point) => point.value);
  const max = maxValue ?? Math.max(...values, 1);
  const stepX = points.length > 1 ? 500 / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = points.length > 1 ? index * stepX : 250;
    const y = 130 - (point.value / max) * 120;
    return [x, y];
  });

  const linePath = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0]},140 L0,140 Z`;
  const gradientId = `trendGrad-${color.replace('#', '')}`;

  return (
    <svg viewBox="0 0 500 140" className="w-full h-36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d={areaPath} fill={`url(#${gradientId})`} />
    </svg>
  );
}
