import { ArrowRight, BarChart3, BookOpenCheck, FolderOpen, MessageSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import AIInsightCard from '../../../components/student/dashboard/AIInsightCard';
import ActivityCard from '../../../components/student/dashboard/ActivityCard';
import CourseProgressCard from '../../../components/student/dashboard/CourseProgressCard';
import DeadlinesCard from '../../../components/student/dashboard/DeadlinesCard';
import QuickActionsCard from '../../../components/student/dashboard/QuickActionsCard';
import StreakCard from '../../../components/student/dashboard/StreakCard';
import WelcomeHeader from '../../../components/student/dashboard/WelcomeHeader';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import StatCard from '../../../components/common/StatCard';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonStat } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { useDashboardData } from '../../../hooks/useDashboardData';
import { deleteQuizAttempt } from '../../../services/api/quizService';
import { setResumeLesson } from '../../../utils/learningHubTarget';
import { setPrefillPrompt } from '../../../utils/aiPrefill';

export default function DashboardPage({ onNavigate }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading } = useDashboardData(refreshVersion);
  const stats = data?.stats ?? [];
  const continueLearning = data?.continueLearning;
  const recommendation = data?.recommendation;
  const confirm = useConfirm();
  const toast = useToast();

  const handleDeleteQuiz = async (attemptId) => {
    const ok = await confirm({
      title: 'Delete this quiz attempt?',
      message: 'This score will be permanently removed from your history.',
    });
    if (!ok) return;

    try {
      await deleteQuizAttempt(attemptId);
      toast.success('Quiz attempt deleted.');
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      toast.error(error.message || 'Could not delete that quiz attempt.');
    }
  };

  const handleContinueLearning = () => {
    if (!continueLearning) return;
    setResumeLesson(continueLearning.lessonId);
    onNavigate('hub');
  };

  const handleReviewRecommendation = () => {
    if (!recommendation?.lessonId) return;
    setResumeLesson(recommendation.lessonId);
    onNavigate('hub');
  };

  const handleAskAilaAboutRecommendation = () => {
    setPrefillPrompt(recommendation?.title ? `Can you help me with "${recommendation.title.replace(/^Review |^Continue /, '')}"?` : 'What should I study next?');
    onNavigate('assistant');
  };

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <WelcomeHeader profile={data?.profile} onAskAI={() => onNavigate('assistant')} />

      {!loading && (
        <AIInsightCard
          recommendation={recommendation}
          onReview={handleReviewRecommendation}
          onAskAila={handleAskAilaAboutRecommendation}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <SkeletonStat key={index} />)
        ) : stats.length ? (
          stats.map((stat) => <StatCard key={stat.label} {...stat} />)
        ) : (
          <div className="col-span-2 lg:col-span-4">
            <EmptyState title="No dashboard metrics yet" message="Complete a lesson, take a quiz, or add a task to start seeing your stats here." />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CourseProgressCard courses={data?.courses ?? []} loading={loading} onViewAll={() => onNavigate('hub')} />
        <QuickActionsCard onNavigate={onNavigate} />
        <ActivityCard activities={data?.activities ?? []} loading={loading} />
        <DeadlinesCard deadlines={data?.deadlines ?? []} loading={loading} onViewAll={() => onNavigate('planner')} />
        <StreakCard streak={data?.streak} loading={loading} />
      </div>

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
          <Card>
            <CardHeader title="Continue learning" />
            {continueLearning ? (
              <div>
                <p className="text-xs text-ink-400 mb-1">{continueLearning.subjectName} / {continueLearning.topicTitle}</p>
                <p className="text-sm font-semibold text-ink-800 mb-3">{continueLearning.lessonTitle}</p>
                <Button size="sm" icon={<ArrowRight size={14} />} onClick={handleContinueLearning}>Resume lesson</Button>
              </div>
            ) : (
              <EmptyState icon={BookOpenCheck} title="All caught up" message="Every tracked lesson is complete. Explore Learning Hub for more." />
            )}
          </Card>

          <Card>
            <CardHeader title="Recent AI conversations" action={<button onClick={() => onNavigate('assistant')} className="text-xs font-semibold text-primary hover:underline">AI Assistant</button>} />
            {data?.recentConversations?.length ? (
              <div className="flex flex-col gap-2.5">
                {data.recentConversations.map((conversation) => (
                  <div key={conversation.id} className="flex items-center gap-2 text-sm text-ink-700">
                    <MessageSquare size={13} className="text-ink-300 flex-shrink-0" />
                    <span className="truncate">{conversation.title || 'Untitled conversation'}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={MessageSquare} title="No conversations yet" message="Chat with AILA to see recent conversations here." />}
          </Card>

          <Card>
            <CardHeader title="Recent quiz scores" action={<button onClick={() => onNavigate('analytics')} className="text-xs font-semibold text-primary hover:underline">Analytics</button>} />
            {data?.recentQuizzes?.length ? (
              <div className="flex flex-col gap-2.5">
                {data.recentQuizzes.map((quiz) => (
                  <div key={quiz.id} className="group flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-700 truncate">{quiz.topic}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-primary font-semibold">{quiz.score}/{quiz.total}</span>
                      <button
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        aria-label={`Delete quiz attempt: ${quiz.topic}`}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={BarChart3} title="No quizzes yet" message="Generate a quiz from Learning Hub or AILA to see scores here." />}
          </Card>

          <Card>
            <CardHeader title="Recently opened resources" action={<button onClick={() => onNavigate('resources')} className="text-xs font-semibold text-primary hover:underline">Resources</button>} />
            {data?.recentlyOpenedResources?.length ? (
              <div className="flex flex-col gap-2.5">
                {data.recentlyOpenedResources.map((resource) => (
                  <div key={resource.id} className="text-sm text-ink-700 truncate">{resource.title}</div>
                ))}
              </div>
            ) : <EmptyState icon={FolderOpen} title="No resources opened" message="Files you open will show up here." />}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="This week's activity" />
            {data?.weeklyActivity?.length ? (
              <div className="flex items-end gap-3 h-24">
                {data.weeklyActivity.map((day) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <div className="w-full bg-primary-300 rounded-md" style={{ height: `${Math.max(8, Math.min(80, day.count * 8))}px` }} />
                    <span className="text-[0.65rem] text-ink-400 font-semibold">{day.day}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No activity yet" message="Completed lessons, quizzes, and tasks will populate this chart." />}
          </Card>
        </div>
      )}
    </div>
  );
}
