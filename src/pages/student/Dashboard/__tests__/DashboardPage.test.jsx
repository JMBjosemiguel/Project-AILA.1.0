import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useDashboardData', () => ({
  useDashboardData: () => state,
}));
vi.mock('../../../../services/api/quizService', () => ({ deleteQuizAttempt: vi.fn() }));
vi.mock('../../../../components/common/ConfirmDialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import DashboardPage from '../index.jsx';

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
    state.data = {
      profile: { first_name: 'Sam', xp_points: 40, level: 1 },
      stats: [{ label: 'Study Streak', value: '3d' }],
      courses: [],
      activities: [],
      deadlines: [],
      streak: { current_streak: 3, longest_streak: 5 },
      recentConversations: [],
      recentQuizzes: [],
      recentlyOpenedResources: [],
      weeklyActivity: [],
      continueLearning: null,
      recommendation: { type: 'on_track', title: "You're on track", message: 'keep going', lessonId: null },
    };

    render(<DashboardPage onNavigate={vi.fn()} />);
    expect(screen.queryByText(/Couldn.t load your dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByText("You're on track")).toBeInTheDocument();
  });
});
