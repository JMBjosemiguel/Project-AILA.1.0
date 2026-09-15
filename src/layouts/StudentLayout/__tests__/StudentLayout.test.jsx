import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'Sam', last_name: 'Lee', profile: { program: 'BSCS', year_level: 2 } } }),
}));
vi.mock('../../../hooks/useNotificationsData', () => ({
  useNotificationsData: () => ({ data: { unreadCount: 0 } }),
}));

import StudentLayout from '../StudentLayout';
import { STUDENT_ROUTE_IDS } from '../../../app/routes/studentRoutes';

describe('StudentLayout mobile sidebar drawer', () => {
  it('is closed by default and opens via the hamburger button', async () => {
    const user = userEvent.setup();
    render(<StudentLayout active={STUDENT_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</StudentLayout>);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes when the sidebar close button is pressed', async () => {
    const user = userEvent.setup();
    render(<StudentLayout active={STUDENT_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</StudentLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('button', { name: /close menu/i }));

    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a navigation item is selected', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<StudentLayout active={STUDENT_ROUTE_IDS.DASHBOARD} onNavigate={onNavigate}>content</StudentLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('button', { name: /^Dashboard$/i }));

    expect(onNavigate).toHaveBeenCalledWith(STUDENT_ROUTE_IDS.DASHBOARD);
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('locks background scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    render(<StudentLayout active={STUDENT_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</StudentLayout>);

    expect(document.body.style.overflow).not.toBe('hidden');
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: /close menu/i }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<StudentLayout active={STUDENT_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</StudentLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
