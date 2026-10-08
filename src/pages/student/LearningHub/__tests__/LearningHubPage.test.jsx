import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningHubPage from '../index';
import { useLearningHubData } from '../../../../hooks/useLearningHubData';
import { searchQuizzes, startQuizAttempt } from '../../../../services/api/quizService';
import { getResourceLibraryData } from '../../../../services/api/resourceService';
import { getLesson } from '../../../../services/api/learningService';

vi.mock('../../../../hooks/useLearningHubData', () => ({
  useLearningHubData: vi.fn(),
}));

vi.mock('../../../../services/api/quizService', () => ({
  searchQuizzes: vi.fn(),
  startQuizAttempt: vi.fn(() => new Promise(() => {})),
  generateQuiz: vi.fn(),
  saveAttemptAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  getQuizAttempt: vi.fn(),
}));

vi.mock('../../../../services/api/resourceService', () => ({
  getResourceLibraryData: vi.fn(),
}));

vi.mock('../../../../services/api/learningService', () => ({
  getLesson: vi.fn(() => new Promise(() => {})),
  completeLesson: vi.fn(),
  deleteCourse: vi.fn(),
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

describe('LearningHubPage search — lessons, quizzes, and resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockHubData();
    searchQuizzes.mockResolvedValue({ quizzes: [] });
    getResourceLibraryData.mockResolvedValue({ resources: [] });
  });

  it('groups a lesson-title match under its own Lessons heading and opens it on click', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'chlorophyll');

    expect(screen.getByText('Lessons')).toBeInTheDocument();
    expect(screen.getByText('Chlorophyll Chemistry')).toBeInTheDocument();
    expect(screen.getByText('in Biology Basics')).toBeInTheDocument();

    await user.click(screen.getByText('Chlorophyll Chemistry'));

    await waitFor(() => expect(getLesson).toHaveBeenCalledWith(1111));
  });

  it('fetches and groups quiz and resource matches by type, case-insensitively', async () => {
    searchQuizzes.mockResolvedValue({
      quizzes: [{ id: 42, topic: 'Cell Biology Quiz', quizType: 'multiple_choice', difficulty: 'medium', assessmentKind: 'practice' }],
    });
    getResourceLibraryData.mockResolvedValue({
      resources: [{ id: 7, title: 'Cell Biology Notes', type: 'pdf' }],
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'Cell Biology');

    await waitFor(() => expect(screen.getByText('Quizzes')).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.getByText('Cell Biology Quiz')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Cell Biology Notes')).toBeInTheDocument();
    expect(searchQuizzes).toHaveBeenCalledWith('cell biology');
    expect(getResourceLibraryData).toHaveBeenCalledWith({ search: 'cell biology' });
  });

  it('opens the quiz runner for a clicked quiz result', async () => {
    searchQuizzes.mockResolvedValue({
      quizzes: [{ id: 42, topic: 'Cell Biology Quiz', quizType: 'multiple_choice', difficulty: 'medium', assessmentKind: 'practice' }],
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'cell biology');
    await waitFor(() => expect(screen.getByText('Cell Biology Quiz')).toBeInTheDocument(), { timeout: 1000 });

    await user.click(screen.getByText('Cell Biology Quiz'));

    await waitFor(() => expect(startQuizAttempt).toHaveBeenCalledWith(42));
  });

  it('navigates to the Resource Library and hands off the search term for a clicked resource result', async () => {
    getResourceLibraryData.mockResolvedValue({
      resources: [{ id: 7, title: 'Cell Biology Notes', type: 'pdf' }],
    });
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<LearningHubPage onNavigate={onNavigate} />);

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'cell biology');
    await waitFor(() => expect(screen.getByText('Cell Biology Notes')).toBeInTheDocument(), { timeout: 1000 });

    await user.click(screen.getByText('Cell Biology Notes'));

    expect(onNavigate).toHaveBeenCalledWith('resources');
    expect(window.sessionStorage.getItem('aila.resourceSearchTerm')).toBe('cell biology');
  });

  it('clears the search box with the clear button', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = screen.getByPlaceholderText(/search subjects/i);

    await user.type(search, 'biology');
    expect(search).toHaveValue('biology');

    await user.click(screen.getByRole('button', { name: /clear search/i }));

    expect(search).toHaveValue('');
    expect(screen.getByText('World History')).toBeInTheDocument();
  });

  it('runs the search immediately on Enter instead of waiting for the debounce', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'cell biology{Enter}');

    await waitFor(() => expect(searchQuizzes).toHaveBeenCalledWith('cell biology'));
  });

  it('shows no lesson/quiz/resource groups alongside the course no-match state when nothing matches anywhere', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/search subjects/i), 'quantum');

    await waitFor(() => expect(searchQuizzes).toHaveBeenCalledWith('quantum'));
    expect(screen.getByText('No matching courses')).toBeInTheDocument();
    expect(screen.queryByText('Lessons')).not.toBeInTheDocument();
    expect(screen.queryByText('Quizzes')).not.toBeInTheDocument();
    expect(screen.queryByText('Resources')).not.toBeInTheDocument();
  });
});
