import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const forgotPassword = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ forgotPassword }),
}));

import ForgotPasswordPage from '../index.jsx';

beforeEach(() => vi.clearAllMocks());

describe('ForgotPasswordPage', () => {
  it('requires an email before submitting — never calls the API with a blank field', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage onGoToLogin={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    expect(screen.getByText('Enter your email to continue.')).toBeInTheDocument();
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('submitting a real email shows the exact generic message — never reveals account existence', async () => {
    const user = userEvent.setup();
    forgotPassword.mockResolvedValue({ sent: true });
    render(<ForgotPasswordPage onGoToLogin={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('you@university.edu'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('student@example.com'));
    expect(screen.getByText('If an account exists for that email, we sent a reset link.')).toBeInTheDocument();
  });

  it('submitting an email that has no account shows the SAME generic message, not an error', async () => {
    const user = userEvent.setup();
    forgotPassword.mockResolvedValue({ sent: true });
    render(<ForgotPasswordPage onGoToLogin={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('you@university.edu'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(screen.getByText('If an account exists for that email, we sent a reset link.')).toBeInTheDocument());
  });

  it('a real failure (e.g. rate limited) shows the server error, not the generic success panel', async () => {
    const user = userEvent.setup();
    forgotPassword.mockRejectedValue({ message: "You've requested a password reset too many times." });
    render(<ForgotPasswordPage onGoToLogin={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('you@university.edu'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(screen.getByText(/too many times/i)).toBeInTheDocument());
    expect(screen.queryByText('If an account exists for that email, we sent a reset link.')).not.toBeInTheDocument();
  });

  it('"Back to sign in" navigates to login', async () => {
    const onGoToLogin = vi.fn();
    const user = userEvent.setup();
    render(<ForgotPasswordPage onGoToLogin={onGoToLogin} />);

    await user.click(screen.getByRole('button', { name: /Back to sign in/i }));
    expect(onGoToLogin).toHaveBeenCalled();
  });
});
