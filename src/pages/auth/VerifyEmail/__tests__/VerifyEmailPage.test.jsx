import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const verifyEmail = vi.fn();
const resendVerification = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ verifyEmail, resendVerification }),
}));

import VerifyEmailPage from '../index.jsx';

function setSearch(search) {
  window.history.pushState({}, '', `/verify-email${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearch('?token=sometoken1234567890abcd');
});

describe('VerifyEmailPage', () => {
  it('shows a verifying state immediately, before the API call resolves', () => {
    verifyEmail.mockReturnValue(new Promise(() => {})); // never resolves
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);
    expect(screen.getByText('Verifying your email...')).toBeInTheDocument();
  });

  it('shows the exact success message and a Sign In button on success', async () => {
    verifyEmail.mockResolvedValue({ alreadyVerified: false });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Email verified successfully.')).toBeInTheDocument());
    expect(screen.getByText('You may now sign in to AILA.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('shows an already-verified state distinct from a fresh success, with a Sign In button', async () => {
    verifyEmail.mockResolvedValue({ alreadyVerified: true });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/already verified/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('shows an invalid-link state for TOKEN_INVALID, with a resend form and Sign In button', async () => {
    verifyEmail.mockRejectedValue({ message: 'bad', details: { code: 'TOKEN_INVALID' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link is invalid.')).toBeInTheDocument());
    expect(screen.queryByText('Verifying your email...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument();
  });

  it('shows a distinct superseded-link state for TOKEN_SUPERSEDED, with a resend form', async () => {
    verifyEmail.mockRejectedValue({ message: 'superseded', details: { code: 'TOKEN_SUPERSEDED' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('A newer verification link was sent.')).toBeInTheDocument());
    expect(screen.getByText(/most recent AILA email/i)).toBeInTheDocument();
    expect(screen.queryByText('This link is invalid.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument();
  });

  it('shows an expired-link state for TOKEN_EXPIRED, with a resend form', async () => {
    verifyEmail.mockRejectedValue({ message: 'expired', details: { code: 'TOKEN_EXPIRED' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link has expired.')).toBeInTheDocument());
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument();
  });

  it('shows a generic error state for a network/server failure with no error code, and no resend form', async () => {
    verifyEmail.mockRejectedValue({ message: 'Network Error' });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Couldn't verify your email.")).toBeInTheDocument());
    // The error state offers no Sign In shortcut — nothing was verified.
    expect(screen.queryByRole('button', { name: /Sign In/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend verification email/i })).not.toBeInTheDocument();
  });

  it('missing token in the URL is treated as an invalid link without calling the API', async () => {
    setSearch('');
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link is invalid.')).toBeInTheDocument());
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('the resend form submits the typed email and shows a generic confirmation, never revealing account existence', async () => {
    const user = userEvent.setup();
    verifyEmail.mockRejectedValue({ message: 'bad', details: { code: 'TOKEN_INVALID' } });
    resendVerification.mockResolvedValue({ sent: true });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('you@university.edu'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('student@example.com'));
    expect(screen.getByText(/a new verification link is on its way/i)).toBeInTheDocument();
  });

  it('a failed resend shows the server error and the button stays enabled to retry', async () => {
    const user = userEvent.setup();
    verifyEmail.mockRejectedValue({ message: 'bad', details: { code: 'TOKEN_INVALID' } });
    resendVerification.mockRejectedValue(new Error('Too many requests. Try again later.'));
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Resend verification email/i })).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('you@university.edu'), 'student@example.com');
    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));

    await waitFor(() => expect(screen.getByText('Too many requests. Try again later.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Resend verification email/i })).not.toBeDisabled();
  });

  it('clicking Sign In after success navigates to login', async () => {
    const onGoToLogin = vi.fn();
    const user = userEvent.setup();
    verifyEmail.mockResolvedValue({ alreadyVerified: false });
    render(<VerifyEmailPage onGoToLogin={onGoToLogin} />);

    await waitFor(() => screen.getByRole('button', { name: /Sign In/i }));
    await user.click(screen.getByRole('button', { name: /Sign In/i }));
    expect(onGoToLogin).toHaveBeenCalled();
  });
});
