import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider } from '../../../../components/common/ConfirmDialog';

vi.mock('../../../../services/api/adminService', () => ({
  listAdminUsers: vi.fn(),
  getAdminUserDetail: vi.fn(),
  setUserActive: vi.fn(),
  deleteAdminUser: vi.fn(),
  resetUserProgress: vi.fn(),
  promoteToAdmin: vi.fn(),
}));
vi.mock('../../../../components/admin/UserDetailDialog', () => ({ default: () => null }));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => toast }));

import AdminUsersPage from '../index.jsx';
import { listAdminUsers, promoteToAdmin } from '../../../../services/api/adminService';

const STUDENT = { id: 10, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', role: 'student', is_active: 1, email_verified_at: '2026-01-01', level: 1, xp_points: 0 };
const ADMIN = { id: 20, first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com', role: 'admin', is_active: 1, email_verified_at: '2026-01-01', level: 1, xp_points: 0 };

function renderPage() {
  return render(
    <ConfirmProvider>
      <AdminUsersPage />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listAdminUsers.mockResolvedValue({
    users: [STUDENT, ADMIN],
    pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
  });
});

describe('AdminUsersPage — Promote to Admin', () => {
  it('offers "Promote to Admin" on a student row, not on an admin row', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    expect(screen.getByRole('menuitem', { name: /Promote to Admin/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Grace Hopper' }));
    expect(screen.queryByRole('menuitem', { name: /Promote to Admin/i })).not.toBeInTheDocument();
  });

  it('cancelling the confirm dialog never calls the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(screen.getByRole('menuitem', { name: /Promote to Admin/i }));

    expect(screen.getByText(/Promote this student to admin\?/i)).toBeInTheDocument();
    expect(screen.getByText(/can't be undone from the app/i)).toBeInTheDocument();
    expect(screen.getByText(/lose access to the student side/i)).toBeInTheDocument();
    expect(screen.getByText(/their progress is kept/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(promoteToAdmin).not.toHaveBeenCalled();
    expect(screen.queryByText(/Promote this student to admin\?/i)).not.toBeInTheDocument();
  });

  it('confirming promotes the student, toasts, and refreshes the list', async () => {
    const user = userEvent.setup();
    promoteToAdmin.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(screen.getByRole('menuitem', { name: /Promote to Admin/i }));
    await user.click(screen.getByRole('button', { name: 'Promote' }));

    await waitFor(() => expect(promoteToAdmin).toHaveBeenCalledWith(10));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Ada'));
    // The list is reloaded after a successful promotion.
    await waitFor(() => expect(listAdminUsers).toHaveBeenCalledTimes(2));
  });

  it('a rejected promotion (e.g. has personal uploads) shows the server error, not a silent success', async () => {
    const user = userEvent.setup();
    promoteToAdmin.mockRejectedValue(new Error('This student has 3 personal uploads that would become visible to all students. Remove them first.'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(screen.getByRole('menuitem', { name: /Promote to Admin/i }));
    await user.click(screen.getByRole('button', { name: 'Promote' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('personal uploads')));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
