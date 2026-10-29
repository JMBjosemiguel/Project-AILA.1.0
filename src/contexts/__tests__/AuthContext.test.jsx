import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/api/authService', () => ({
  authService: { refreshSession: vi.fn(), getCurrentUser: vi.fn() },
}));

import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { authService } from '../../services/api/authService';
import StudentSidebar from '../../layouts/StudentLayout/StudentSidebar.jsx';

const student = (program) => ({
  id: 1, role: 'student', first_name: 'Jose', last_name: 'Belleza', profile: { program, year_level: 2 },
});

function RefreshButton() {
  const { refreshUser } = useAuth();
  return <button type="button" onClick={() => refreshUser()}>refresh</button>;
}

function renderWithSidebar() {
  return render(
    <AuthProvider>
      <StudentSidebar active="dashboard" onNavigate={vi.fn()} open onClose={vi.fn()} />
      <RefreshButton />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authService.refreshSession.mockResolvedValue({ token: 't', user: student('BSIT') });
});

describe('AuthContext refreshUser', () => {
  it('reloads the signed-in user so the sidebar shows the new program right away', async () => {
    const user = userEvent.setup();
    authService.getCurrentUser.mockResolvedValue(student('BS Nursing'));
    renderWithSidebar();
    expect(await screen.findByText('BSIT — Yr 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(screen.getByText('BS Nursing — Yr 2')).toBeInTheDocument());
    expect(screen.queryByText('BSIT — Yr 2')).not.toBeInTheDocument();
    expect(screen.getByText('Jose Belleza')).toBeInTheDocument();
  });

  it('keeps the current user if the reload fails', async () => {
    const user = userEvent.setup();
    authService.getCurrentUser.mockRejectedValue(new Error('offline'));
    renderWithSidebar();
    expect(await screen.findByText('BSIT — Yr 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
    expect(screen.getByText('BSIT — Yr 2')).toBeInTheDocument();
  });
});
