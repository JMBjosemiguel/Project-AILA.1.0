import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const summaryState = { data: null, loading: false, error: null };
const achievementsState = { data: null, loading: false, error: null };
const leaderboardState = { data: null, loading: false, error: null };

vi.mock('../../../../hooks/useGamificationData', () => ({
  useGamificationSummary: () => summaryState,
  useAchievementsData: () => achievementsState,
  useLeaderboardData: () => leaderboardState,
}));

import AchievementsPage from '../index.jsx';
import { STUDENT_ROUTES, STUDENT_ROUTE_IDS } from '../../../../app/routes/studentRoutes';
import { SHOW_GAMIFICATION } from '../../../../constants/studentFeatures';

// Gamification hidden: the default (constants/studentFeatures, shared with the server).
beforeEach(() => {
  summaryState.data = {
    xp: 215, level: 3, xpIntoLevel: 15, xpForNextLevel: 100, progressPercent: 15,
    streak: { current: 4, best: 9 }, achievementCount: 1, totalAchievements: 3,
    recentAchievements: [], nextAchievements: [], leaderboardOptIn: true,
  };
  achievementsState.data = {
    earnedCount: 2,
    totalCount: 4,
    earned: [
      { slug: 'first_lesson', name: 'First Steps', description: 'Complete your first lesson', category: 'learning', iconKey: 'book_open', xpReward: 5, earnedAt: '2026-09-01T00:00:00Z' },
      { slug: 'level_5', name: 'Rising Scholar', description: 'Reach Level 5', category: 'level', iconKey: 'graduation_cap', xpReward: 0, earnedAt: '2026-09-02T00:00:00Z' },
    ],
    locked: [
      { slug: 'streak_7', name: 'One Week Strong', description: 'Reach a 7-day study streak', category: 'streak', iconKey: 'flame', xpReward: 15, progress: { current: 4, target: 7 } },
      { slug: 'level_10', name: 'AILA Achiever', description: 'Reach Level 10', category: 'level', iconKey: 'trophy', xpReward: 0, progress: { current: 3, target: 10 } },
    ],
  };
  leaderboardState.data = { period: 'weekly', entries: [{ rank: 1, displayName: 'Ana C.', level: 4, xp: 300 }], me: null };
});

describe('Study milestones (gamification hidden by default)', () => {
  it('is off by default, and the page and nav are called "Study milestones"', () => {
    expect(SHOW_GAMIFICATION).toBe(false);
    const route = STUDENT_ROUTES[STUDENT_ROUTE_IDS.ACHIEVEMENTS];
    expect(route.label).toBe('Study milestones');
    expect(route.title).toBe('Study milestones');
    expect(route.subtitle).not.toMatch(/leaderboard/i);
  });

  it('shows the study streak but no level, XP or leaderboard', () => {
    render(<AchievementsPage onNavigate={vi.fn()} />);
    expect(screen.getByText(/Study streak: 4 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Level 3|XP/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /leaderboard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/leaderboard|Ana C\./i)).not.toBeInTheDocument();
  });

  it('lists only study milestones: level achievements and XP rewards are hidden', () => {
    render(<AchievementsPage onNavigate={vi.fn()} />);
    expect(screen.getByText((_, el) => el?.textContent === '1 of 2 milestones reached')).toBeInTheDocument();
    expect(screen.getByText('First Steps')).toBeInTheDocument();
    expect(screen.getByText('One Week Strong')).toBeInTheDocument();
    expect(screen.getByText('4 / 7 days')).toBeInTheDocument();
    expect(screen.queryByText('Rising Scholar')).not.toBeInTheDocument();
    expect(screen.queryByText('AILA Achiever')).not.toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ XP/)).not.toBeInTheDocument();
  });
});
