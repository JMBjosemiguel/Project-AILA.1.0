import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/adminService', () => ({
  getAdminDashboard: vi.fn(),
  sendAnnouncement: vi.fn(),
}));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import AdminDashboardPage from '../index.jsx';
import { getAdminDashboard } from '../../../../services/api/adminService';

const BASE_STATS = {
  totalStudents: 10, totalCourses: 5, totalResources: 3, totalConversations: 4,
  totalLessons: 20, totalQuizAttempts: 8, totalFeedback: 2, avgFeedbackRating: 4.5, activeUsersToday: 1,
  needsAttention: { feedbackPending: 2, unverifiedOver24h: 3, studentsNeedingHelp: 7 },
  studentsNeedingHelp: [
    { id: 101, first_name: 'Ada', last_name: 'Lovelace', reason: 'No activity for 9 days' },
    { id: 102, first_name: 'Grace', last_name: 'Hopper', reason: 'Recent quiz average 42%' },
  ],
  activeStudentsByDay: [
    { date: '2026-10-06', count: 0 },
    { date: '2026-10-07', count: 2 },
    { date: '2026-10-08', count: 0 },
    { date: '2026-10-09', count: 1 },
    { date: '2026-10-10', count: 0 },
    { date: '2026-10-11', count: 3 },
    { date: '2026-10-12', count: 1 },
  ],
  recentActivity: {
    registrations: [], courses: [], uploads: [], quizCompletions: [], feedback: [],
    deletions: [
      { id: 1, action: 'user.delete', target_table: 'users', target_id: 1, created_at: '2026-10-12T10:00:00Z', first_name: 'AILA', last_name: 'Administrator' },
      { id: 2, action: 'user.delete', target_table: 'users', target_id: 2, created_at: '2026-10-12T09:59:00Z', first_name: 'AILA', last_name: 'Administrator' },
      { id: 3, action: 'user.delete', target_table: 'users', target_id: 3, created_at: '2026-10-12T09:58:00Z', first_name: 'AILA', last_name: 'Administrator' },
      { id: 4, action: 'resource.delete', target_table: 'resources', target_id: 9, created_at: '2026-10-12T09:00:00Z', first_name: 'AILA', last_name: 'Administrator' },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getAdminDashboard.mockResolvedValue(BASE_STATS);
});

describe('AdminDashboardPage — needs attention & insights', () => {
  it('shows the needs-attention counts', async () => {
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    const feedbackButton = await screen.findByRole('button', { name: /Feedback awaiting reply/ });
    expect(within(feedbackButton).getByText('2')).toBeInTheDocument();

    const unverifiedButton = screen.getByRole('button', { name: /Unverified 24h\+/ });
    expect(within(unverifiedButton).getByText('3')).toBeInTheDocument();

    const needsHelpButton = screen.getByRole('button', { name: /Students who may need help/ });
    expect(within(needsHelpButton).getByText('7')).toBeInTheDocument();
  });

  it('clicking the feedback/unverified counts navigates to the right page', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AdminDashboardPage onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByText('Feedback awaiting reply')).toBeInTheDocument());

    await user.click(screen.getByText('Feedback awaiting reply'));
    expect(onNavigate).toHaveBeenCalledWith('feedback');

    await user.click(screen.getByText('Unverified 24h+'));
    expect(onNavigate).toHaveBeenCalledWith('users');
  });

  it('lists students who may need help with their reason, and links to their user details', async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    expect(screen.getByText('No activity for 9 days')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Recent quiz average 42%')).toBeInTheDocument();

    const [viewButton] = screen.getAllByRole('button', { name: 'View' });
    await user.click(viewButton);
    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/admin/users?userId=101');
  });

  it('collapses consecutive identical admin deletions into one row', async () => {
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('AILA Administrator removed 3 users')).toBeInTheDocument());

    expect(screen.getByText('AILA Administrator removed a resource')).toBeInTheDocument();
    expect(screen.queryByText('AILA Administrator removed a user')).not.toBeInTheDocument();
  });

  it('shows an empty state when no students need help', async () => {
    getAdminDashboard.mockResolvedValue({ ...BASE_STATS, studentsNeedingHelp: [], needsAttention: { ...BASE_STATS.needsAttention, studentsNeedingHelp: 0 } });
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Everyone's doing fine")).toBeInTheDocument());
  });

  it('renders the active-students chart (not the empty state) when there is at least one active day', async () => {
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Active students')).toBeInTheDocument());
    expect(screen.queryByText('No active students yet')).not.toBeInTheDocument();
  });

  it('shows an empty state for the chart when every day is zero', async () => {
    getAdminDashboard.mockResolvedValue({
      ...BASE_STATS,
      activeStudentsByDay: BASE_STATS.activeStudentsByDay.map((d) => ({ ...d, count: 0 })),
    });
    render(<AdminDashboardPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Active students')).toBeInTheDocument());
    expect(screen.getByText('No active students yet')).toBeInTheDocument();
  });
});
