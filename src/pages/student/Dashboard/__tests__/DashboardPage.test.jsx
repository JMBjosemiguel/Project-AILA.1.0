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

describe('DashboardPage — recent quiz scores', () => {
  it('shows the Grade beside each raw score', () => {
    state.data = {
      ...baseData,
      recentQuizzes: [
        { id: 1, topic: 'Drug Classes', score: 3, total: 4 },
        { id: 2, topic: 'Vital Signs', score: 0, total: 5 },
      ],
    };
    state.loading = false;
    state.error = null;
    render(<DashboardPage onNavigate={vi.fn()} />);

    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('Grade 88%')).toBeInTheDocument(); // (3 / 4 x 50) + 50 = 87.5
    expect(screen.getByText('0/5')).toBeInTheDocument();
    expect(screen.getByText('Grade 50%')).toBeInTheDocument();
  });
});

describe('DashboardPage — study-focused layout', () => {
  const learningData = () => ({
    ...baseData,
    stats: [
      { label: 'Completed Lessons', value: '2', delta: 'this week' },
      { label: 'Study Streak', value: '3d' },
      { label: 'Pending Tasks', value: '1' },
      { label: 'Avg Quiz Score', value: '72%' },
    ],
    continueLearning: { lessonId: 7, lessonTitle: 'Cell Structure', topicTitle: 'Cells', subjectName: 'Biology' },
    recommendation: { type: 'weak_topic', title: 'Review Photosynthesis', message: 'reinforce', lessonId: 99 },
    weakTopics: [{ topicId: 3, topic: 'Fluid balance', subject: 'Nursing 101', avgPercent: 42 }],
    deadlines: [{ id: 1, title: 'Read chapter 4', deadline: '2026-11-02T00:00:00Z', priority_label: 'High' }],
    recentQuizzes: [{ id: 1, topic: 'Drug Classes', score: 3, total: 4 }],
  });

  function renderDashboard(data = learningData()) {
    state.data = data;
    state.loading = false;
    state.error = null;
    return render(<DashboardPage onNavigate={vi.fn()} />);
  }

  const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('puts learning first, in order: continue learning, recommendation, weak topics, study tasks, recent quiz scores', () => {
    renderDashboard();
    const order = [
      screen.getByText('Continue learning'),
      screen.getByText('Review Photosynthesis'),
      screen.getByText('Weak topics'),
      screen.getByText('Upcoming study tasks'),
      screen.getByText('Recent quiz scores'),
    ];
    for (let i = 1; i < order.length; i += 1) expect(follows(order[i - 1], order[i])).toBe(true);
  });

  it('shows the streak and study milestones (no level or XP) as one compact row below the learning content', () => {
    renderDashboard();
    const row = screen.getByRole('region', { name: 'Your progress' });
    expect(row).not.toHaveTextContent(/Level|XP/);
    expect(row).toHaveTextContent('Study streak: 3 days (best 5)');
    expect(row).toHaveTextContent(/study milestones/i);
    expect(follows(screen.getByText('Recent quiz scores'), row)).toBe(true);
    expect(follows(screen.getByText('Course progress'), row)).toBe(true);
  });

  it('no longer shows the streak as a stat card, nor the old streak and achievements cards', () => {
    renderDashboard();
    expect(screen.getByText('Completed Lessons')).toBeInTheDocument();
    expect(screen.getByText('Avg Quiz Score')).toBeInTheDocument();
    expect(screen.queryByText('3d')).not.toBeInTheDocument();
    expect(screen.queryByText('Study streak')).not.toBeInTheDocument();
    expect(screen.queryByText('No badges yet')).not.toBeInTheDocument();
  });

  it('does not show the leaderboard (it stays on the Achievements page)', () => {
    renderDashboard();
    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
  });

  it('lists weak topics with their quiz average', () => {
    renderDashboard();
    expect(screen.getByText('Fluid balance')).toBeInTheDocument();
    expect(screen.getByText('Nursing 101')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('says so when there are no weak topics', () => {
    renderDashboard({ ...learningData(), weakTopics: [] });
    expect(screen.getByText('No weak topics')).toBeInTheDocument();
  });
});

describe('DashboardPage — expired timed attempt in the resume list', () => {
  it('says "Time\'s up, see results" instead of "Resume", and still opens the quiz', async () => {
    const user = userEvent.setup();
    setResumeQuiz.mockClear();
    const onNavigate = vi.fn();
    state.error = null;
    state.loading = false;
    state.data = {
      ...baseData,
      activeQuizAttempts: [
        { attemptId: 9, quizId: 42, topic: 'Photosynthesis', total: 6, answered: 3, progressPercent: 50, timeLimitSeconds: 600, expired: true },
        { attemptId: 10, quizId: 43, topic: 'Respiration', total: 4, answered: 1, progressPercent: 25, timeLimitSeconds: 600, expired: false },
      ],
    };
    render(<DashboardPage onNavigate={onNavigate} />);

    expect(screen.getAllByRole('button', { name: /^Resume$/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: "Time's up, see results" }));
    expect(setResumeQuiz).toHaveBeenCalledWith(42);
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });
});
