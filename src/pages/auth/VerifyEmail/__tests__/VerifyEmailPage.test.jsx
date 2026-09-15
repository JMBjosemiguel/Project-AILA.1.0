import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const verifyEmail = vi.fn();
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ verifyEmail }),
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

  it('shows an invalid-link state for TOKEN_INVALID, with no Verifying/success text left over', async () => {
    verifyEmail.mockRejectedValue({ message: 'bad', details: { code: 'TOKEN_INVALID' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link is invalid.')).toBeInTheDocument());
    expect(screen.queryByText('Verifying your email...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('folds TOKEN_USED into the same invalid-link state as TOKEN_INVALID', async () => {
    verifyEmail.mockRejectedValue({ message: 'used', details: { code: 'TOKEN_USED' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link is invalid.')).toBeInTheDocument());
  });

  it('shows an expired-link state for TOKEN_EXPIRED', async () => {
    verifyEmail.mockRejectedValue({ message: 'expired', details: { code: 'TOKEN_EXPIRED' } });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link has expired.')).toBeInTheDocument());
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
  });

  it('shows a generic error state for a network/server failure with no error code', async () => {
    verifyEmail.mockRejectedValue({ message: 'Network Error' });
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Couldn't verify your email.")).toBeInTheDocument());
    // The error state offers no Sign In shortcut — nothing was verified.
    expect(screen.queryByRole('button', { name: /Sign In/i })).not.toBeInTheDocument();
  });

  it('missing token in the URL is treated as an invalid link without calling the API', async () => {
    setSearch('');
    render(<VerifyEmailPage onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('This link is invalid.')).toBeInTheDocument());
    expect(verifyEmail).not.toHaveBeenCalled();
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
