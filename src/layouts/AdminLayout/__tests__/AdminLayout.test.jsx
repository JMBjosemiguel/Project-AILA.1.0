import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'Ada', last_name: 'Admin' } }),
}));

import AdminLayout from '../AdminLayout';
import { ADMIN_ROUTE_IDS } from '../../../app/routes/adminRoutes';

describe('AdminLayout mobile sidebar drawer', () => {
  it('is closed by default and opens via the hamburger button', async () => {
    const user = userEvent.setup();
    render(<AdminLayout active={ADMIN_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</AdminLayout>);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes when the sidebar close button is pressed', async () => {
    const user = userEvent.setup();
    render(<AdminLayout active={ADMIN_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</AdminLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('button', { name: /close menu/i }));

    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a navigation item is selected', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AdminLayout active={ADMIN_ROUTE_IDS.DASHBOARD} onNavigate={onNavigate}>content</AdminLayout>);

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    await user.click(screen.getByRole('button', { name: /^Dashboard$/i }));

    expect(onNavigate).toHaveBeenCalledWith(ADMIN_ROUTE_IDS.DASHBOARD);
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('locks background scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    render(<AdminLayout active={ADMIN_ROUTE_IDS.DASHBOARD} onNavigate={vi.fn()}>content</AdminLayout>);

    expect(document.body.style.overflow).not.toBe('hidden');
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: /close menu/i }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
