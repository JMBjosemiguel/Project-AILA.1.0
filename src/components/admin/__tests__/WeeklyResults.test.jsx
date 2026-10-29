import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import WeeklyResults from '../WeeklyResults.jsx';

// Mondays 00:00 Asia/Manila, oldest first, as the API sends them.
const weeks = Array.from({ length: 8 }, (_, i) => ({
  weekStart: new Date(Date.UTC(2026, 8, 6 + i * 7, 16)).toISOString(),
  activeStudents: i,
  quizzesCompleted: i * 2,
  avgQuizScore: i === 0 ? null : 60 + i,
  lessonsCompleted: i * 3,
  newRegistrations: i === 7 ? 4 : 0,
}));

describe('WeeklyResults', () => {
  it('shows one row per week, newest first, with every metric', () => {
    render(<WeeklyResults weeks={weeks} timezone="Asia/Manila" />);

    expect(screen.getByText('Weekly results')).toBeInTheDocument();
    for (const header of ['Week of', 'Active students', 'Quizzes completed', 'Avg quiz score', 'Lessons completed', 'New registrations']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows).toHaveLength(8);

    // Newest week first, labelled in the app timezone (Mon 26 Oct, Manila).
    const current = within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Oct 26 (this week)');
    expect(current).toEqual(['7', '14', '67%', '21', '4']);

    // Oldest week last; no quizzes means no average.
    expect(within(rows[7]).getByRole('rowheader')).toHaveTextContent('Sep 7');
    expect(within(rows[7]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0', '0', '—', '0', '0']);
  });

  it('notes the week boundary and that chat quizzes are not counted', () => {
    render(<WeeklyResults weeks={weeks} timezone="Asia/Manila" />);
    expect(screen.getByText(/weeks start Monday \(Asia\/Manila\) · chat quizzes not included/)).toBeInTheDocument();
  });

  it('has an empty state', () => {
    render(<WeeklyResults weeks={[]} />);
    expect(screen.getByText('No weekly results yet')).toBeInTheDocument();
  });
});
