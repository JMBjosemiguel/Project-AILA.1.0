import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useNotificationsData', () => ({
  useNotificationsData: () => state,
}));
vi.mock('../../../../components/common/ConfirmDialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../services/api/notificationService', () => ({
  deleteAllNotifications: vi.fn(), deleteNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn(),
}));

import NotificationsPage from '../index.jsx';

beforeEach(() => {
  state.data = null; state.loading = false; state.error = null;
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
