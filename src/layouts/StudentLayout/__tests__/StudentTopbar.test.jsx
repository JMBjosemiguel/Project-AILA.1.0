import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentTopbar from '../StudentTopbar';
import { ConfirmProvider } from '../../../components/common/ConfirmDialog';
import { STUDENT_ROUTE_IDS } from '../../../app/routes/studentRoutes';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { first_name: 'Sam', last_name: 'Lee' },
    logout: logoutMock,
  }),
}));

vi.mock('../../../hooks/useNotificationsData', () => ({
  useNotificationsData: () => ({ data: { unreadCount: 0 } }),
}));

function renderTopbar(onNavigate = vi.fn()) {
  const view = render(
    <ConfirmProvider>
      <StudentTopbar
        active={STUDENT_ROUTE_IDS.DASHBOARD}
        sidebarOpen={false}
        onMenuClick={vi.fn()}
        onNavigate={onNavigate}
      />
    </ConfirmProvider>
  );
  return { onNavigate, ...view };
}

function getHeaderSearch() {
  return screen.getByPlaceholderText('Search AILA...');
}

function getPaletteSearch() {
  return screen.getByRole('textbox', { name: 'Search AILA' });
}

describe('StudentTopbar command palette', () => {
  it('renders the global search input without the shortcut badge', () => {
    renderTopbar();

    expect(getHeaderSearch()).toBeInTheDocument();
    expect(screen.queryByText('K')).not.toBeInTheDocument();
  });

  it('opens the palette when the search input is clicked', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());

    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();
    expect(getPaletteSearch()).toHaveFocus();
  });

  it('shows exactly one search input at a time, in the same spot as the topbar search box', async () => {
    const user = userEvent.setup();
    renderTopbar();

    expect(screen.getAllByPlaceholderText('Search AILA...')).toHaveLength(1);

    await user.click(getHeaderSearch());

    expect(screen.getAllByPlaceholderText('Search AILA...')).toHaveLength(1);
    expect(getPaletteSearch()).toBeInTheDocument();
  });

  it('closes the palette when clicking outside it', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());
    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole('dialog', { name: /search aila destinations/i })).not.toBeInTheDocument();
  });

  it('opens the palette with Ctrl+K', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();
  });

  it('opens the palette with Cmd+K', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.keyboard('{Meta>}k{/Meta}');

    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();
  });

  it('closes the palette on Escape', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /search aila destinations/i })).not.toBeInTheDocument();
  });

  it('closes the palette when the active student route changes', async () => {
    const user = userEvent.setup();
    const { rerender, onNavigate } = renderTopbar();

    await user.click(getHeaderSearch());
    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();

    rerender(
      <ConfirmProvider>
        <StudentTopbar
          active={STUDENT_ROUTE_IDS.ASSISTANT}
          sidebarOpen={false}
          onMenuClick={vi.fn()}
          onNavigate={onNavigate}
        />
      </ConfirmProvider>
    );

    expect(screen.queryByRole('dialog', { name: /search aila destinations/i })).not.toBeInTheDocument();
  });

  it('closes the palette when the browser tab becomes hidden', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());
    expect(screen.getByRole('dialog', { name: /search aila destinations/i })).toBeInTheDocument();

    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    hiddenSpy.mockRestore();

    expect(screen.queryByRole('dialog', { name: /search aila destinations/i })).not.toBeInTheDocument();
  });

  it('filters student navigation destinations as the user types', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());
    await user.type(getPaletteSearch(), 'planner');

    const dialog = screen.getByRole('dialog', { name: /search aila destinations/i });
    expect(within(dialog).getByRole('option', { name: /Study Planner/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /Dashboard/i })).not.toBeInTheDocument();
  });

  it('selects the highlighted destination with Enter', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTopbar();

    await user.click(getHeaderSearch());
    await user.type(getPaletteSearch(), 'resources');
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith(STUDENT_ROUTE_IDS.RESOURCES);
    expect(screen.queryByRole('dialog', { name: /search aila destinations/i })).not.toBeInTheDocument();
  });

  it('supports Arrow Up and Arrow Down before selecting with Enter', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTopbar();

    await user.click(getHeaderSearch());
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onNavigate).toHaveBeenCalledWith(STUDENT_ROUTE_IDS.ASSISTANT);
  });

  it('navigates when a result is clicked', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderTopbar();

    await user.click(getHeaderSearch());
    await user.click(screen.getByRole('option', { name: /Learning Hub/i }));

    expect(onNavigate).toHaveBeenCalledWith(STUDENT_ROUTE_IDS.HUB);
  });

  it('shows a no-results state for an unmatched query', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());
    await user.type(getPaletteSearch(), 'not-a-real-place');

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('does not expose admin routes', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(getHeaderSearch());

    expect(screen.queryByRole('option', { name: /Users/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Knowledge Base/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Audit Log/i })).not.toBeInTheDocument();
  });
});

describe('StudentTopbar logout confirmation', () => {
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
