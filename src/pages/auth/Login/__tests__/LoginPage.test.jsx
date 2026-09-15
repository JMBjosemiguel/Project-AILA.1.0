import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const login = vi.fn();
const resendVerification = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ login, resendVerification }),
}));

import LoginPage from '../index.jsx';

async function fillAndSubmit(user, { email = 'ada@example.com', password = 'Password1!' } = {}) {
  await user.type(screen.getByPlaceholderText('student@example.edu'), email);
  await user.type(screen.getByPlaceholderText('Enter your password'), password);
  await user.click(screen.getByRole('button', { name: /Sign in/i }));
}

beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('a successful login calls onAuthenticated with the user role', async () => {
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    login.mockResolvedValue({ user: { role: 'student' } });
    render(<LoginPage onAuthenticated={onAuthenticated} onGoToRegister={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('student'));
  });

  it('an unverified account shows the friendly verification-required message and a resend option', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue({
      message: 'Please verify your email address before signing in.',
      details: { code: 'EMAIL_NOT_VERIFIED' },
    });
    render(<LoginPage onAuthenticated={vi.fn()} onGoToRegister={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText('Please verify your email address before signing in.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument();
  });

  it('a wrong password does NOT show the resend option (only EMAIL_NOT_VERIFIED does)', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue({ message: 'Invalid email or password.', details: null });
    render(<LoginPage onAuthenticated={vi.fn()} onGoToRegister={vi.fn()} />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Resend verification email/i })).not.toBeInTheDocument();
  });

  it('resending from the login page shows a success message', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue({ message: 'unverified', details: { code: 'EMAIL_NOT_VERIFIED' } });
    resendVerification.mockResolvedValue({ sent: true });
    render(<LoginPage onAuthenticated={vi.fn()} onGoToRegister={vi.fn()} />);
    await fillAndSubmit(user);
    await waitFor(() => screen.getByRole('button', { name: /Resend verification email/i }));

    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(screen.getByText(/Verification email sent/i)).toBeInTheDocument());
    expect(resendVerification).toHaveBeenCalledWith('ada@example.com');
  });

  it('resend failure on the login page shows an error message', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue({ message: 'unverified', details: { code: 'EMAIL_NOT_VERIFIED' } });
    resendVerification.mockRejectedValue({ message: "You've requested a verification email too many times." });
    render(<LoginPage onAuthenticated={vi.fn()} onGoToRegister={vi.fn()} />);
    await fillAndSubmit(user);
    await waitFor(() => screen.getByRole('button', { name: /Resend verification email/i }));

    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(screen.getByText(/too many times/i)).toBeInTheDocument());
  });
});
