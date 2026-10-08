import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTopbar from '../AdminTopbar';
import { ConfirmProvider } from '../../../components/common/ConfirmDialog';
import { ADMIN_ROUTE_IDS } from '../../../app/routes/adminRoutes';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { first_name: 'Ada', last_name: 'Admin' },
    logout: logoutMock,
  }),
}));

function renderTopbar(onNavigate = vi.fn()) {
  const view = render(
    <ConfirmProvider>
      <AdminTopbar
        active={ADMIN_ROUTE_IDS.DASHBOARD}
        sidebarOpen={false}
        onMenuClick={vi.fn()}
        onNavigate={onNavigate}
      />
    </ConfirmProvider>
  );
  return { onNavigate, ...view };
}

describe('AdminTopbar logout confirmation', () => {
  it('asks for confirmation and stays logged in on Cancel', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTopbar();
    logoutMock.mockClear();

    await user.click(screen.getByTitle('Log out'));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Log out?')).toBeInTheDocument();
    expect(within(dialog).getByText("You'll need to sign in again to continue.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('logs out and navigates to /login on Confirm', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTopbar();
    logoutMock.mockClear();

    await user.click(screen.getByTitle('Log out'));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Log out' }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/login');
  });
});
