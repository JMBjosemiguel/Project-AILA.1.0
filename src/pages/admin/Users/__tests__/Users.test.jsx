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
vi.mock('../../../../components/admin/UserDetailDialog', () => ({
  default: ({ userId }) => <div data-testid="user-detail-dialog">{userId}</div>,
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => toast }));

let mockCurrentUser = null;
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockCurrentUser }) }));

import AdminUsersPage from '../index.jsx';
import { listAdminUsers, promoteToAdmin, deleteAdminUser } from '../../../../services/api/adminService';

const STUDENT = { id: 10, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', role: 'student', is_active: 1, email_verified_at: '2026-01-01', level: 1, xp_points: 0 };
const ADMIN = { id: 20, first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com', role: 'admin', is_active: 1, email_verified_at: '2026-01-01', level: 1, xp_points: 0 };
const OTHER_ADMIN = { id: 30, first_name: 'Alan', last_name: 'Turing', email: 'alan@example.com', role: 'admin', is_active: 1, email_verified_at: '2026-01-01', level: 1, xp_points: 0 };

function renderPage() {
  return render(
    <ConfirmProvider>
      <AdminUsersPage />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCurrentUser = null;
  window.history.replaceState({}, '', '/admin/users');
  listAdminUsers.mockResolvedValue({
    users: [STUDENT, ADMIN],
    pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
  });
});

describe('AdminUsersPage — opening a user from a ?userId= deep link', () => {
  it('opens that user\'s detail dialog on mount and cleans up the URL', async () => {
    window.history.replaceState({}, '', '/admin/users?userId=10');
    renderPage();

    await waitFor(() => expect(screen.getByTestId('user-detail-dialog')).toHaveTextContent('10'));
    expect(window.location.search).toBe('');
  });

  it('does nothing when there is no userId in the URL', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.queryByTestId('user-detail-dialog')).not.toBeInTheDocument();
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

describe('AdminUsersPage — deleting an admin account', () => {
  it('hides Delete and Deactivate on your own row, but shows them on other admins', async () => {
    mockCurrentUser = { id: 20 };
    listAdminUsers.mockResolvedValue({
      users: [ADMIN, OTHER_ADMIN],
      pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Grace Hopper' }));
    expect(screen.queryByRole('menuitem', { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Deactivate/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Grace Hopper' }));

    await user.click(screen.getByRole('button', { name: 'Actions for Alan Turing' }));
    expect(screen.getByRole('menuitem', { name: /^Delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Deactivate/i })).toBeInTheDocument();
  });

  it('shows an admin-specific confirm message and deletes on confirm', async () => {
    mockCurrentUser = { id: 20 };
    listAdminUsers.mockResolvedValue({
      users: [ADMIN, OTHER_ADMIN],
      pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
    });
    deleteAdminUser.mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Alan Turing')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Alan Turing' }));
    await user.click(screen.getByRole('menuitem', { name: /^Delete$/i }));

    expect(screen.getByText(/Delete admin account Alan Turing\?/i)).toBeInTheDocument();
    expect(screen.getByText(/lose admin access immediately/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteAdminUser).toHaveBeenCalledWith(30));
    expect(toast.success).toHaveBeenCalledWith('Admin account deleted.');
  });

  it('a rejected delete (e.g. last active admin) shows the server error', async () => {
    mockCurrentUser = { id: 20 };
    listAdminUsers.mockResolvedValue({
      users: [ADMIN, OTHER_ADMIN],
      pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
    });
    deleteAdminUser.mockRejectedValue(new Error('AILA needs at least one admin.'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Alan Turing')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Alan Turing' }));
    await user.click(screen.getByRole('menuitem', { name: /^Delete$/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AILA needs at least one admin.'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
