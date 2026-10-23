import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const resetPassword = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ resetPassword }),
}));

import ResetPasswordPage from '../index.jsx';

function setSearch(search) {
  window.history.pushState({}, '', `/reset-password${search}`);
}

async function fillAndSubmit(user, { password = 'NewPassw0rd1!', confirm = password } = {}) {
  await user.type(screen.getByPlaceholderText('Min. 8 characters'), password);
  await user.type(screen.getByPlaceholderText('Repeat password'), confirm);
  await user.click(screen.getByRole('button', { name: /Update password/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearch('?token=sometoken1234567890abcd');
});

describe('ResetPasswordPage', () => {
  it('a missing token in the URL is treated as an invalid link, with no form shown and no API call', () => {
    setSearch('');
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    expect(screen.getByText('This password reset link is invalid.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Min. 8 characters')).not.toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters before calling the API', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user, { password: 'short', confirm: 'short' });

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('rejects a confirm-password mismatch before calling the API', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user, { password: 'NewPassw0rd1!', confirm: 'Different1!' });

    expect(screen.getByText('Password confirmation does not match.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('a successful reset calls the API with the token + password, and shows "Password updated" with a sign-in link', async () => {
    const user = userEvent.setup();
    resetPassword.mockResolvedValue(null);
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ token: 'sometoken1234567890abcd', password: 'NewPassw0rd1!' }));
    expect(screen.getByText('Password updated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('an expired link (TOKEN_EXPIRED) shows a clear, distinct message with a "request a new link" option', async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue({ message: 'expired', details: { code: 'TOKEN_EXPIRED' } });
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Request a new link/i })).toBeInTheDocument();
  });

  it('a used/invalid link (TOKEN_INVALID) shows a clear, distinct message', async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue({ message: 'bad', details: { code: 'TOKEN_INVALID' } });
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText(/invalid or has already been used/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Request a new link/i })).toBeInTheDocument();
  });

  it('clicking "Request a new link" after an expired/invalid link navigates to forgot-password', async () => {
    const user = userEvent.setup();
    const onGoToForgotPassword = vi.fn();
    resetPassword.mockRejectedValue({ message: 'expired', details: { code: 'TOKEN_EXPIRED' } });
    render(<ResetPasswordPage onGoToLogin={vi.fn()} onGoToForgotPassword={onGoToForgotPassword} />);

    await fillAndSubmit(user);
    await waitFor(() => screen.getByRole('button', { name: /Request a new link/i }));
    await user.click(screen.getByRole('button', { name: /Request a new link/i }));

    expect(onGoToForgotPassword).toHaveBeenCalled();
  });

  it('clicking "Sign in" after a successful reset navigates to login', async () => {
    const user = userEvent.setup();
    const onGoToLogin = vi.fn();
    resetPassword.mockResolvedValue(null);
    render(<ResetPasswordPage onGoToLogin={onGoToLogin} onGoToForgotPassword={vi.fn()} />);

    await fillAndSubmit(user);
    await waitFor(() => screen.getByRole('button', { name: /Sign in/i }));
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(onGoToLogin).toHaveBeenCalled();
  });
});
