import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../../services/api/adminService', () => ({ getAdminAnalytics: vi.fn() }));
vi.mock('../../../../components/admin/TopicGroups', () => ({ default: () => null }));

import AdminChatbotRulesPage from '../index.jsx';
import { getAdminAnalytics } from '../../../../services/api/adminService';

const analytics = {
  registrations: [], aiUsage: [], quizTrend: [], lessonCompletions: [],
  popularCourses: [], popularResources: [], activeStudents: [], strongTopics: [], weakTopics: [],
  timezone: 'Asia/Manila',
  weeklyResults: [
    { weekStart: '2026-10-18T16:00:00.000Z', activeStudents: 3, quizzesCompleted: 5, avgQuizScore: 70, lessonsCompleted: 8, newRegistrations: 1 },
    { weekStart: '2026-10-25T16:00:00.000Z', activeStudents: 6, quizzesCompleted: 9, avgQuizScore: 81, lessonsCompleted: 12, newRegistrations: 2 },
  ],
};

describe('Admin Analytics page — weekly results', () => {
  it('shows the Weekly results section first, above the daily charts', async () => {
    getAdminAnalytics.mockResolvedValue(analytics);
    render(<AdminChatbotRulesPage />);

    const heading = await screen.findByText('Weekly results');
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    const daily = screen.getByText('New registrations', { selector: 'h3, h2, p, span, div' });
    expect(heading.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Admin Analytics page — most active students by studying', () => {
  it('ranks by lessons + quizzes completed and shows study stats, not XP or level', async () => {
    getAdminAnalytics.mockResolvedValue({
      ...analytics,
      activeStudents: [
        { id: 1, first_name: 'Ana', last_name: 'Cruz', lessons_completed: 12, quizzes_completed: 5, avg_quiz_score: 81 },
        { id: 2, first_name: 'Ben', last_name: 'Reyes', lessons_completed: 1, quizzes_completed: 0, avg_quiz_score: null },
        { id: 3, first_name: 'Cy', last_name: 'Lim', lessons_completed: 0, quizzes_completed: 0, avg_quiz_score: null },
      ],
    });
    render(<AdminChatbotRulesPage />);

    expect(await screen.findByText('By lessons + quizzes completed')).toBeInTheDocument();
    expect(screen.getByText('12 lessons · 5 quizzes')).toBeInTheDocument();
    expect(screen.getByText('Avg 81%')).toBeInTheDocument();
    expect(screen.getByText('1 lesson · 0 quizzes')).toBeInTheDocument();
    expect(screen.getByText('No quizzes')).toBeInTheDocument();
    expect(screen.queryByText('Cy Lim')).not.toBeInTheDocument(); // no study activity
    expect(screen.queryByText(/XP|Lv\./)).not.toBeInTheDocument();
  });
});
