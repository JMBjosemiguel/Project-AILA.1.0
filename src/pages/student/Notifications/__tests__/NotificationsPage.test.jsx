import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
const state = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useNotificationsData', () => ({
  useNotificationsData: () => state,
}));
vi.mock('../../../../components/common/ConfirmDialog', () => ({ useConfirm: () => confirmMock }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../services/api/notificationService', () => ({
  deleteAllNotifications: vi.fn(), deleteNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn(),
}));

import NotificationsPage from '../index.jsx';
import { deleteAllNotifications } from '../../../../services/api/notificationService';

beforeEach(() => {
  state.data = null; state.loading = false; state.error = null;
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
});

describe('NotificationsPage — error vs empty', () => {
  it('shows the empty state when the API succeeds with no notifications', () => {
    state.data = { notifications: [] };
    render(<NotificationsPage />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows an error with Retry (not a misleading empty state) when the API fails', () => {
    state.error = new Error('Unable to reach the server.');
    render(<NotificationsPage />);
    expect(screen.getByText(/Couldn.t load your notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/Unable to reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it('renders notifications when the API returns some', () => {
    state.data = { notifications: [{ id: 1, title: 'Lesson completed', body: 'nice', type: 'system', is_read: false, created_at: '2026-09-01T00:00:00Z' }] };
    render(<NotificationsPage />);
    expect(screen.getByText('Lesson completed')).toBeInTheDocument();
  });
});

describe('NotificationsPage — type icons', () => {
  function makeNotification(overrides) {
    return { id: 1, body: 'x', is_read: false, created_at: '2026-09-01T00:00:00Z', ...overrides };
  }

  it('shows a distinct icon per notification kind instead of a plain letter badge', () => {
    state.data = {
      notifications: [
        makeNotification({ id: 1, title: 'Quiz scored', type: 'system' }),
        makeNotification({ id: 2, title: 'Level up!', type: 'system' }),
        makeNotification({ id: 3, title: 'Achievement unlocked', type: 'system' }),
        makeNotification({ id: 4, title: 'New announcement', type: 'announcement' }),
        makeNotification({ id: 5, title: 'Task due soon', type: 'reminder' }),
        makeNotification({ id: 6, title: 'Course ready', type: 'system' }),
      ],
    };
    const { container } = render(<NotificationsPage />);

    expect(container.querySelector('.lucide-clipboard-check')).toBeInTheDocument(); // quiz scored
    expect(container.querySelector('.lucide-zap')).toBeInTheDocument(); // level up
    expect(container.querySelector('.lucide-trophy')).toBeInTheDocument(); // achievement
    expect(container.querySelector('.lucide-megaphone')).toBeInTheDocument(); // announcement
    expect(container.querySelector('.lucide-calendar-clock')).toBeInTheDocument(); // reminder
    expect(container.querySelector('.lucide-sparkles')).toBeInTheDocument(); // generic system
    // No more raw first-letter badges.
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('falls back to a bell icon for an unrecognized type', () => {
    state.data = { notifications: [makeNotification({ title: 'Something else', type: 'unknown_type' })] };
    const { container } = render(<NotificationsPage />);
    expect(container.querySelector('.lucide-bell')).toBeInTheDocument();
  });
});

describe('NotificationsPage — delete all confirmation', () => {
  it('asks for confirmation, and declining never calls the delete-all API', async () => {
    const user = userEvent.setup();
    confirmMock.mockResolvedValue(false);
    state.data = { notifications: [{ id: 1, title: 'Lesson completed', body: 'nice', type: 'system', is_read: false, created_at: '2026-09-01T00:00:00Z' }] };
    render(<NotificationsPage />);

    await user.click(screen.getByRole('button', { name: /delete all/i }));

    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/delete all/i) }));
    expect(deleteAllNotifications).not.toHaveBeenCalled();
    expect(screen.getByText('Lesson completed')).toBeInTheDocument();
  });

  it('confirming deletes all notifications', async () => {
    const user = userEvent.setup();
    confirmMock.mockResolvedValue(true);
    state.data = { notifications: [{ id: 1, title: 'Lesson completed', body: 'nice', type: 'system', is_read: false, created_at: '2026-09-01T00:00:00Z' }] };
    render(<NotificationsPage />);

    await user.click(screen.getByRole('button', { name: /delete all/i }));

    expect(confirmMock).toHaveBeenCalled();
    expect(deleteAllNotifications).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});
