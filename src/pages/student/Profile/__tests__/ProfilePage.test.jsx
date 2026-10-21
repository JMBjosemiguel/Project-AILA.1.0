import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const profileState = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useProfileData', () => ({ useProfileData: () => profileState }));

const updateProfile = vi.fn().mockResolvedValue({});
vi.mock('../../../../services/api/profileService', () => ({
  updateProfile: (...args) => updateProfile(...args),
  changePassword: vi.fn(),
}));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import ProfilePage from '../index.jsx';

const data = {
  user: { first_name: 'Jose', last_name: 'Belleza', email: 'j@example.com', student_number: 'S1' },
  profile: { program: 'BSIT', year_level: 2, bio: '', xp_points: 120, level: 2, leaderboard_opt_in: false },
  activities: [],
};

beforeEach(() => {
  updateProfile.mockClear();
  profileState.data = data;
  profileState.loading = false;
  profileState.error = null;
});

describe('Profile leaderboard opt-in', () => {
  it('shows the switch reflecting the current (opted-out) setting', () => {
    render(<ProfilePage />);
    const toggle = screen.getByRole('switch', { name: /show me on the leaderboard/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('persists the new value through updateProfile when toggled on', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(screen.getByRole('switch', { name: /show me on the leaderboard/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ leaderboard_opt_in: true }));
  });

  it('reflects an opted-in profile as checked', () => {
    profileState.data = { ...data, profile: { ...data.profile, leaderboard_opt_in: true } };
    render(<ProfilePage />);
    expect(screen.getByRole('switch', { name: /show me on the leaderboard/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not leak what is shared — the helper text names the hidden fields', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/email, program, year, and scores are never shown/i)).toBeInTheDocument();
  });
});

describe('Profile load failure', () => {
  it('shows an error state with a Retry button instead of silently rendering placeholder "Pending" text', () => {
    profileState.data = null;
    profileState.loading = false;
    profileState.error = new Error('Unable to reach the server. Please try again.');

    render(<ProfilePage />);

    expect(screen.getByText(/couldn't load your profile/i)).toBeInTheDocument();
    expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText('Profile pending')).not.toBeInTheDocument();
  });

  it('while still loading, does not show the error state even if a stale error is present', () => {
    profileState.data = null;
    profileState.loading = true;
    profileState.error = new Error('stale error from a previous attempt');

    render(<ProfilePage />);

    expect(screen.queryByText(/couldn't load your profile/i)).not.toBeInTheDocument();
  });
});
