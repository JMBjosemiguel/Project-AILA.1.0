import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const register = vi.fn();
const resendVerification = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ register, resendVerification }),
}));

import RegisterPage from '../index.jsx';

// AuthInput doesn't wire label -> input with htmlFor/id, so query by
// placeholder (the same way a screen reader fallback / visual QA would).
async function fillAndSubmit(user, { email = 'ada@example.com' } = {}) {
  await user.type(screen.getByPlaceholderText('First name'), 'Ada');
  await user.type(screen.getByPlaceholderText('Last name'), 'Lovelace');
  await user.type(screen.getByPlaceholderText('you@university.edu'), email);
  await user.type(screen.getByPlaceholderText('Min. 8 characters'), 'Password1!');
  await user.type(screen.getByPlaceholderText('Repeat password'), 'Password1!');
  await user.click(screen.getByRole('button', { name: /Create account/i }));
}

beforeEach(() => vi.clearAllMocks());

describe('RegisterPage', () => {
  it('after a successful registration, shows the "Check your email" panel with a masked address', async () => {
    const user = userEvent.setup();
    register.mockResolvedValue({ user: { id: 1 } });
    render(<RegisterPage onGoToLogin={vi.fn()} />);

    await fillAndSubmit(user, { email: 'ada@example.com' });

    await waitFor(() => expect(screen.getByText('One more step to activate your account')).toBeInTheDocument());
    expect(screen.getByText(/a\*\*\*@example\.com/)).toBeInTheDocument();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('the resend button sends, shows a cooldown, and then a success message', async () => {
    const user = userEvent.setup();
    register.mockResolvedValue({ user: { id: 1 } });
    resendVerification.mockResolvedValue({ alreadyVerified: false });
    render(<RegisterPage onGoToLogin={vi.fn()} />);
    await fillAndSubmit(user);
    await waitFor(() => screen.getByText('One more step to activate your account'));

    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(screen.getByText('Verification email sent again.')).toBeInTheDocument());
    expect(resendVerification).toHaveBeenCalledWith('ada@example.com');
    // Cooldown disables the button and relabels it instead of "Resend verification email".
    expect(screen.getByRole('button', { name: /Resend available in \d+s/i })).toBeDisabled();
  });

  it('a resend failure shows an error message and does not start a cooldown', async () => {
    const user = userEvent.setup();
    register.mockResolvedValue({ user: { id: 1 } });
    resendVerification.mockRejectedValue({ message: 'Could not resend the verification email. Please try again.' });
    render(<RegisterPage onGoToLogin={vi.fn()} />);
    await fillAndSubmit(user);
    await waitFor(() => screen.getByText('One more step to activate your account'));

    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(screen.getByText(/Could not resend/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Resend verification email/i })).not.toBeDisabled();
  });

  it('a registration failure (e.g. duplicate email) keeps the form visible with an error, no panel switch', async () => {
    const user = userEvent.setup();
    register.mockRejectedValue({ message: 'An account with this email already exists.' });
    render(<RegisterPage onGoToLogin={vi.fn()} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText('An account with this email already exists.')).toBeInTheDocument());
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
  });

  it('"Back to sign in" from the check-your-email panel navigates to login', async () => {
    const user = userEvent.setup();
    const onGoToLogin = vi.fn();
    register.mockResolvedValue({ user: { id: 1 } });
    render(<RegisterPage onGoToLogin={onGoToLogin} />);
    await fillAndSubmit(user);
    await waitFor(() => screen.getByText('One more step to activate your account'));

    await user.click(screen.getByRole('button', { name: /Back to sign in/i }));
    expect(onGoToLogin).toHaveBeenCalled();
  });
});
