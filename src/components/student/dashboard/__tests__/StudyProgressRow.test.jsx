import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyProgressRow from '../StudyProgressRow.jsx';

const summary = {
  achievementCount: 4,
  totalAchievements: 20,
  recentAchievements: [{ slug: 'first_lesson', name: 'First Lesson' }],
};

describe('StudyProgressRow — XP, level, streak and achievements in one row', () => {
  it('shows progress INTO the current level, not xp % 500', () => {
    // Level 3 (250 XP) -> 50 XP into the level, bar at 50%.
    render(<StudyProgressRow profile={{ xp_points: 250, level: 3 }} streak={null} summary={null} onNavigate={vi.fn()} />);
    expect(screen.getByText('Level 3 · 50/100 XP')).toBeInTheDocument();
    expect(document.querySelector('[style*="width: 50%"]')).toBeTruthy();
  });

  it('renders a full-but-not-over bar just before the next level', () => {
    render(<StudyProgressRow profile={{ xp_points: 99, level: 1 }} onNavigate={vi.fn()} />);
    expect(screen.getByText('Level 1 · 99/100 XP')).toBeInTheDocument();
    expect(document.querySelector('[style*="width: 99%"]')).toBeTruthy();
  });

  it('derives the level from XP when the profile omits it', () => {
    render(<StudyProgressRow profile={{ xp_points: 340 }} onNavigate={vi.fn()} />);
    expect(screen.getByText('Level 4 · 40/100 XP')).toBeInTheDocument();
  });

  it('handles a missing profile, streak and summary without crashing', () => {
    render(<StudyProgressRow profile={null} streak={null} summary={null} onNavigate={vi.fn()} />);
    expect(screen.getByText('Level 1 · 0/100 XP')).toBeInTheDocument();
    expect(screen.getByText(/Study streak: 0 days/)).toBeInTheDocument();
    expect(screen.getByText('Achievements')).toBeInTheDocument();
  });

  it('shows the streak and achievements in calm wording, and links to the full view', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <StudyProgressRow
        profile={{ xp_points: 120, level: 2 }}
        streak={{ current_streak: 1, longest_streak: 5 }}
        summary={summary}
        onNavigate={onNavigate}
      />
    );

    const row = screen.getByRole('region', { name: 'Your progress' });
    expect(row).toHaveTextContent('Study streak: 1 day (best 5)');
    expect(row).toHaveTextContent('4 of 20 achievements · Latest: First Lesson');
    expect(row).not.toHaveTextContent(/leaderboard|rank/i);

    await user.click(screen.getByRole('button', { name: /View progress/i }));
    expect(onNavigate).toHaveBeenCalledWith('achievements');
  });

  it('shows a skeleton while loading', () => {
    render(<StudyProgressRow loading onNavigate={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Your progress' })).not.toBeInTheDocument();
  });
});
