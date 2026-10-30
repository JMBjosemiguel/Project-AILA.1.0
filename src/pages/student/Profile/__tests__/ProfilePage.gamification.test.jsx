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
const refreshUser = vi.fn().mockResolvedValue(null);
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ refreshUser }) }));

// Gamification SHOWN (off by default, see ProfilePage.test.jsx): the
// leaderboard opt-in and the XP / Level stats.
vi.mock('../../../../constants/studentFeatures', async (importOriginal) => ({
  ...(await importOriginal()),
  SHOW_GAMIFICATION: true,
}));

import ProfilePage from '../index.jsx';

const data = {
  user: { first_name: 'Jose', last_name: 'Belleza', email: 'j@example.com', student_number: 'S1' },
  profile: { program: 'BSIT', year_level: 2, bio: '', xp_points: 120, level: 2, leaderboard_opt_in: false },
  activities: [],
};

beforeEach(() => {
  updateProfile.mockReset();
  updateProfile.mockResolvedValue({});
  refreshUser.mockClear();
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

describe('Profile XP / Level stats (gamification shown)', () => {
  it('shows XP and Level in the profile header', () => {
    render(<ProfilePage />);
    expect(screen.getByText('XP')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });
});
