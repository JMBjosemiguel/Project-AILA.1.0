import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const summaryState = { data: null, loading: false, error: null };
const achievementsState = { data: null, loading: false, error: null };
const leaderboardState = { data: null, loading: false, error: null };

vi.mock('../../../../hooks/useGamificationData', () => ({
  useGamificationSummary: () => summaryState,
  useAchievementsData: () => achievementsState,
  useLeaderboardData: () => leaderboardState,
}));

import AchievementsPage from '../index.jsx';

const summary = {
  xp: 215, level: 3, xpIntoLevel: 15, xpForNextLevel: 100, progressPercent: 15,
  streak: { current: 4, best: 9 },
  achievementCount: 2, totalAchievements: 12,
  recentAchievements: [], nextAchievements: [], leaderboardOptIn: false,
};

const achievements = {
  earnedCount: 1,
  totalCount: 3,
  earned: [
    { slug: 'first_lesson', name: 'First Steps', description: 'Complete your first lesson', category: 'learning', iconKey: 'book_open', xpReward: 5, earnedAt: '2026-09-01T00:00:00Z' },
  ],
  locked: [
    { slug: 'lessons_10', name: 'Dedicated Learner', description: 'Complete 10 lessons', category: 'learning', iconKey: 'book_open', xpReward: 20, progress: { current: 3, target: 10 } },
    { slug: 'perfect_quiz', name: 'Perfect Score', description: 'Score 100% on a quiz', category: 'learning', iconKey: 'star', xpReward: 15, progress: null },
  ],
};

beforeEach(() => {
  summaryState.data = summary;
  summaryState.loading = false;
  achievementsState.data = achievements;
  achievementsState.loading = false;
  leaderboardState.data = { period: 'weekly', weekStart: '2026-09-07T00:00:00.000Z', entries: [], me: null };
  leaderboardState.loading = false;
});

describe('AchievementsPage', () => {
  it('shows the level / XP header from the summary', () => {
    render(<AchievementsPage onNavigate={vi.fn()} />);
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('4-day streak')).toBeInTheDocument();
    expect(screen.getByText('15 / 100 XP to Level 4')).toBeInTheDocument();
  });

  it('lists earned and locked achievements with progress', () => {
    render(<AchievementsPage onNavigate={vi.fn()} />);
    expect(screen.getByText((_, el) => el?.textContent === '1 of 3 unlocked')).toBeInTheDocument();
    expect(screen.getByText('First Steps')).toBeInTheDocument();
    expect(screen.getByText('Dedicated Learner')).toBeInTheDocument();
    expect(screen.getByText('3 / 10 lessons')).toBeInTheDocument();
  });

  it('switches to the leaderboard tab and nudges opt-out students to their profile', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AchievementsPage onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(screen.getByText(/not on the leaderboard yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show me on the leaderboard/i }));
    expect(onNavigate).toHaveBeenCalledWith('profile');
  });

  it('renders leaderboard rows and highlights the current student', async () => {
    const user = userEvent.setup();
    summaryState.data = { ...summary, leaderboardOptIn: true };
    leaderboardState.data = {
      period: 'weekly',
      weekStart: '2026-09-07T00:00:00.000Z',
      entries: [
        { rank: 1, displayName: 'Bruno B.', level: 4, xp: 90, weeklyXp: 90, totalXp: 320 },
        { rank: 2, displayName: 'Alice A.', level: 2, xp: 40, weeklyXp: 40, totalXp: 120 },
      ],
      me: { rank: 2, xp: 40 },
    };

    render(<AchievementsPage onNavigate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Leaderboard' }));

    expect(screen.queryByText(/not on the leaderboard yet/i)).not.toBeInTheDocument();
    expect(screen.getByText('Bruno B.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('never renders raw PII columns for other students', async () => {
    const user = userEvent.setup();
    leaderboardState.data = {
      period: 'all_time', weekStart: null,
      entries: [{ rank: 1, displayName: 'Bruno B.', level: 4, xp: 320, weeklyXp: 0, totalXp: 320 }],
      me: null,
    };
    render(<AchievementsPage onNavigate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByText(/user_id/i)).not.toBeInTheDocument();
  });
});
