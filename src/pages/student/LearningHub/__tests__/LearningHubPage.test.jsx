import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningHubPage from '../index';
import { useLearningHubData } from '../../../../hooks/useLearningHubData';

vi.mock('../../../../hooks/useLearningHubData', () => ({
  useLearningHubData: vi.fn(),
}));

const subjects = [
  {
    id: 1,
    name: 'Biology Basics',
    code: 'BIO101',
    description: 'Introductory life science course',
    difficulty: 'beginner',
    goal: 'Understand living systems',
    is_ai_generated: true,
    progress_percent: 20,
    modules: [
      {
        id: 11,
        title: 'Cellular Foundations',
        topics_count: 1,
        progress_percent: 20,
        topics: [
          {
            id: 111,
            title: 'Photosynthesis Flow',
            progress_percent: 20,
            lessons: [
              {
                id: 1111,
                title: 'Chlorophyll Chemistry',
                completed: false,
                difficulty: 'easy',
                estimated_minutes: 15,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'World History',
    code: 'HIS201',
    description: 'Global events and civilizations',
    difficulty: 'intermediate',
    goal: 'Prepare for finals',
    is_ai_generated: true,
    progress_percent: 0,
    modules: [
      {
        id: 22,
        title: 'Ancient Empires',
        topics_count: 1,
        progress_percent: 0,
        topics: [
          {
            id: 222,
            title: 'Trade Routes',
            progress_percent: 0,
            lessons: [
              {
                id: 2222,
                title: 'Silk Road Overview',
                completed: false,
                difficulty: 'medium',
                estimated_minutes: 20,
              },
            ],
          },
        ],
      },
    ],
  },
];

function mockHubData(nextSubjects = subjects) {
  useLearningHubData.mockReturnValue({
    data: { subjects: nextSubjects },
    loading: false,
    error: null,
  });
}

function renderPage() {
  return render(<LearningHubPage />);
}

describe('LearningHubPage search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockHubData();
  });

  it('filters by subject name case-insensitively', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'biology');

    expect(screen.getByText('Biology Basics')).toBeInTheDocument();
    expect(screen.queryByText('World History')).not.toBeInTheDocument();
  });

  it('matches module, topic, and lesson titles through their parent subject', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = screen.getByPlaceholderText(/search subjects/i);

    await user.type(search, 'cellular');
    expect(screen.getByText('Biology Basics')).toBeInTheDocument();
    expect(screen.queryByText('World History')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'photosynthesis');
    expect(screen.getByText('Biology Basics')).toBeInTheDocument();
    expect(screen.queryByText('World History')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'chlorophyll');
    expect(screen.getByText('Biology Basics')).toBeInTheDocument();
    expect(screen.queryByText('World History')).not.toBeInTheDocument();
  });

  it('treats whitespace-only search as empty search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), '   ');

    expect(screen.getByText('Biology Basics')).toBeInTheDocument();
    expect(screen.getByText('World History')).toBeInTheDocument();
  });

  it('shows the no-match state when existing subjects do not match', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'quantum');

    expect(screen.getByText('No matching courses')).toBeInTheDocument();
    expect(screen.queryByText('No courses yet')).not.toBeInTheDocument();
  });

  it('keeps the normal empty state when there are no subjects', () => {
    mockHubData([]);
    renderPage();

    expect(screen.getByText('No courses yet')).toBeInTheDocument();
    expect(screen.queryByText('No matching courses')).not.toBeInTheDocument();
  });
});
