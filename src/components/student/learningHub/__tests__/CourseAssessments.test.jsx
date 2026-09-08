import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const assessmentsState = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useCourseAssessments', () => ({
  useCourseAssessments: () => assessmentsState,
}));
vi.mock('../../../../services/api/learningService', () => ({
  openModuleCheckpoint: vi.fn(),
  openCourseFinal: vi.fn(),
}));
vi.mock('../../../common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import CourseAssessments from '../CourseAssessments.jsx';
import { openModuleCheckpoint, openCourseFinal } from '../../../../services/api/learningService';

function mapWith({ m1, m2, final }) {
  return {
    subjectId: 5,
    courseName: 'Databases',
    modules: [
      { moduleId: 11, title: 'Basics', totalTopics: 2, completedTopics: 1, contentCompleted: false, moduleCompleted: false, checkpoint: { status: 'locked', quizId: null, passingScore: 70, ...m1 } },
      { moduleId: 12, title: 'Indexes', totalTopics: 2, completedTopics: 2, contentCompleted: true, moduleCompleted: false, checkpoint: { status: 'ready', quizId: null, passingScore: 70, itemCount: 8, ...m2 } },
    ],
    final: { status: 'locked', quizId: null, passingScore: 70, ...final },
    prerequisitesForFinal: { allCheckpointsPassed: false },
    courseCompleted: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assessmentsState.loading = false;
  assessmentsState.error = null;
});

describe('CourseAssessments', () => {
  it('shows a locked checkpoint with a progress hint and no button', () => {
    assessmentsState.data = mapWith({});
    render(<CourseAssessments subjectId={5} onLaunchAssessment={vi.fn()} />);
    expect(screen.getByText('Checkpoint — Basics')).toBeInTheDocument();
    expect(screen.getAllByText(/Locked/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Complete this module's lessons to unlock \(1\/2 topics done\)/)).toBeInTheDocument();
  });

  it('a ready checkpoint offers Take and launches the generated quiz', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    assessmentsState.data = mapWith({});
    openModuleCheckpoint.mockResolvedValue({ id: 900, assessmentKind: 'module_checkpoint', passingScore: 70, items: [] });

    render(<CourseAssessments subjectId={5} onLaunchAssessment={onLaunch} />);
    await user.click(screen.getByRole('button', { name: /^Take$/ }));

    await waitFor(() => expect(openModuleCheckpoint).toHaveBeenCalledWith(5, 12));
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ quizId: 900, assessmentKind: 'module_checkpoint' }));
  });

  it('an in-progress checkpoint offers Resume', () => {
    assessmentsState.data = mapWith({ m2: { status: 'in_progress', quizId: 900 } });
    render(<CourseAssessments subjectId={5} onLaunchAssessment={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
  });

  it('a failed checkpoint shows the score, passing mark, Review and Retake', () => {
    const onLaunch = vi.fn();
    assessmentsState.data = mapWith({ m2: { status: 'failed', quizId: 900, latestScore: 50, passingScore: 70, reviewAttemptId: 77 } });
    render(<CourseAssessments subjectId={5} onLaunchAssessment={onLaunch} />);
    expect(screen.getByText(/Score 50% · need 70%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retake/ })).toBeInTheDocument();
  });

  it('a passed checkpoint shows Passed and only a Review button', () => {
    assessmentsState.data = mapWith({ m2: { status: 'passed', quizId: 900, bestScore: 90, passingScore: 70, reviewAttemptId: 78 } });
    render(<CourseAssessments subjectId={5} onLaunchAssessment={vi.fn()} />);
    expect(screen.getByText(/Passed · best 90%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retake/ })).not.toBeInTheDocument();
  });

  it('the course final is locked until every checkpoint is passed, then Startable', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    // final ready
    assessmentsState.data = mapWith({
      m1: { status: 'passed' }, m2: { status: 'passed' },
      final: { status: 'ready', quizId: null, passingScore: 70, itemCount: 16 },
    });
    openCourseFinal.mockResolvedValue({ id: 950, assessmentKind: 'course_final', passingScore: 70, items: [] });

    render(<CourseAssessments subjectId={5} onLaunchAssessment={onLaunch} />);
    expect(screen.getByText('Course Final — Long Test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Start final/ }));
    await waitFor(() => expect(openCourseFinal).toHaveBeenCalledWith(5));
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ quizId: 950, assessmentKind: 'course_final' }));
  });

  it('shows a completion note when the whole course is done', () => {
    assessmentsState.data = { ...mapWith({ m1: { status: 'passed' }, m2: { status: 'passed' }, final: { status: 'passed' } }), courseCompleted: true };
    render(<CourseAssessments subjectId={5} onLaunchAssessment={vi.fn()} />);
    expect(screen.getByText(/Course complete/i)).toBeInTheDocument();
  });
});
