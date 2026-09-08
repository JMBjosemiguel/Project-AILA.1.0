import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useDashboardData', () => ({
  useDashboardData: () => state,
}));
vi.mock('../../../../hooks/useGamificationData', () => ({
  useGamificationSummary: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../../services/api/quizService', () => ({ deleteQuizAttempt: vi.fn() }));
vi.mock('../../../../components/common/ConfirmDialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const setResumeQuiz = vi.fn();
vi.mock('../../../../utils/quizResumeTarget', () => ({ setResumeQuiz: (id) => setResumeQuiz(id) }));

import DashboardPage from '../index.jsx';

const baseData = {
  profile: { first_name: 'Sam', xp_points: 40, level: 1 },
  stats: [{ label: 'Study Streak', value: '3d' }],
  courses: [], activities: [], deadlines: [],
  streak: { current_streak: 3, longest_streak: 5 },
  recentConversations: [], recentQuizzes: [], recentlyOpenedResources: [],
  weeklyActivity: [], activeQuizAttempts: [], continueLearning: null,
  recommendation: { type: 'on_track', title: "You're on track", message: 'keep going', lessonId: null },
};

describe('DashboardPage — reliability', () => {
  it('shows an error state with a retry action when the summary fails to load', async () => {
    state.data = null;
    state.loading = false;
    state.error = new Error('Unable to reach the server. Please try again.');

    render(<DashboardPage onNavigate={vi.fn()} />);

    expect(screen.getByText(/Couldn.t load your dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Unable to reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    // it does NOT pretend everything is empty
    expect(screen.queryByText(/No dashboard metrics yet/i)).not.toBeInTheDocument();
  });

  it('renders the dashboard normally when data loads', () => {
    state.error = null;
    state.loading = false;
    state.data = { ...baseData };

    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.queryByText(/Couldn.t load your dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByText("You're on track")).toBeInTheDocument();
  });

  it('hides the Resume Test widget when there is no unfinished attempt', () => {
    state.error = null;
    state.loading = false;
    state.data = { ...baseData, activeQuizAttempts: [] };

    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.queryByText(/Resume a test/i)).not.toBeInTheDocument();
  });

  it('shows the Resume Test widget for an active attempt and routes to it on click', async () => {
    const user = userEvent.setup();
    setResumeQuiz.mockClear();
    const onNavigate = vi.fn();
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      activeQuizAttempts: [
        { attemptId: 9, quizId: 42, topic: 'Photosynthesis', total: 6, answered: 3, progressPercent: 50 },
      ],
    };

    render(<DashboardPage onNavigate={onNavigate} />);
    expect(screen.getByText(/Resume a test/i)).toBeInTheDocument();
    expect(screen.getByText('Photosynthesis')).toBeInTheDocument();
    expect(screen.getByText('3/6 answered')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Resume/i }));
    expect(setResumeQuiz).toHaveBeenCalledWith(42);
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('puts the Resume Test widget above the AI Insight', () => {
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      activeQuizAttempts: [{ attemptId: 9, quizId: 42, topic: 'Photosynthesis', total: 6, answered: 3, progressPercent: 50 }],
    };
    render(<DashboardPage onNavigate={vi.fn()} />);
    const resume = screen.getByText(/Resume a test/i);
    const insight = screen.getByText(/AI Insight/i);
    expect(resume.compareDocumentPosition(insight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides "Continue learning" when the AI Insight already points at the same lesson', () => {
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      continueLearning: { lessonId: 7, lessonTitle: 'Cell Structure', topicTitle: 'Cells', subjectName: 'Biology' },
      recommendation: { type: 'weak_topic', title: 'Review Cells', message: 'reinforce', lessonId: 7 },
    };
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.queryByText('Continue learning')).not.toBeInTheDocument();
    expect(screen.getByText('Review Cells')).toBeInTheDocument();
  });

  it('keeps "Continue learning" when it points somewhere different from the AI Insight', () => {
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      continueLearning: { lessonId: 7, lessonTitle: 'Cell Structure', topicTitle: 'Cells', subjectName: 'Biology' },
      recommendation: { type: 'weak_topic', title: 'Review Photosynthesis', message: 'reinforce', lessonId: 99 },
    };
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.getByText('Continue learning')).toBeInTheDocument();
  });

  it('labels an unfinished module checkpoint in the Resume Test widget', () => {
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      activeQuizAttempts: [{ attemptId: 9, quizId: 42, topic: 'Indexes', assessmentKind: 'module_checkpoint', total: 8, answered: 3, progressPercent: 38 }],
    };
    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.getByText('Module Checkpoint — Indexes')).toBeInTheDocument();
  });

  it('a failed assessment recommendation shows "Review now" and routes to the hub', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      recommendation: {
        type: 'failed_assessment', title: 'Retry the "Indexes" module checkpoint',
        message: 'You scored 40% (passing is 70%).', lessonId: null, subjectId: 5,
      },
    };
    render(<DashboardPage onNavigate={onNavigate} />);
    expect(screen.getByText('Retry the "Indexes" module checkpoint')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Review now/i }));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });
});
