import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AchievementBadge from '../AchievementBadge.jsx';

const base = {
  slug: 'lessons_10',
  name: 'Dedicated Learner',
  description: 'Complete 10 lessons',
  category: 'learning',
  iconKey: 'book_open',
  xpReward: 20,
};

describe('AchievementBadge', () => {
  it('shows an earned badge with its earned date and no progress bar', () => {
    render(<AchievementBadge achievement={base} earned earnedAt="2026-09-01T00:00:00Z" />);
    expect(screen.getByText('Dedicated Learner')).toBeInTheDocument();
    expect(screen.getByText('+20 XP')).toBeInTheDocument();
    expect(screen.getByText(/Earned Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/\/ 10 lessons/)).not.toBeInTheDocument();
  });

  it('shows a countable progress label for a locked achievement', () => {
    render(<AchievementBadge achievement={{ ...base, progress: { current: 7, target: 10 } }} />);
    expect(screen.getByText('7 / 10 lessons')).toBeInTheDocument();
  });

  it('caps displayed progress at the target', () => {
    render(<AchievementBadge achievement={{ ...base, progress: { current: 13, target: 10 } }} />);
    expect(screen.getByText('10 / 10 lessons')).toBeInTheDocument();
  });

  it('renders a streak achievement progress in days and a level one in levels', () => {
    const { rerender } = render(
      <AchievementBadge achievement={{ ...base, category: 'streak', iconKey: 'flame', progress: { current: 2, target: 7 } }} />
    );
    expect(screen.getByText('2 / 7 days')).toBeInTheDocument();

    rerender(
      <AchievementBadge achievement={{ ...base, category: 'level', iconKey: 'graduation_cap', progress: { current: 3, target: 5 } }} />
    );
    expect(screen.getByText('Level 3 / 5')).toBeInTheDocument();
  });

  it('shows no progress bar for a binary (null-progress) locked achievement', () => {
    render(<AchievementBadge achievement={{ ...base, slug: 'perfect_quiz', name: 'Perfect Score', progress: null }} />);
    expect(screen.getByText('Perfect Score')).toBeInTheDocument();
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('falls back gracefully for an unknown icon key', () => {
    render(<AchievementBadge achievement={{ ...base, iconKey: 'not_a_real_key' }} earned />);
    expect(screen.getByText('Dedicated Learner')).toBeInTheDocument();
  });
});
