import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api/quizService', () => ({
  getAttemptIdForActivity: vi.fn(),
  getQuizAttempt: vi.fn(),
  startQuizAttempt: vi.fn(),
  saveAttemptAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  generateQuiz: vi.fn(),
  startBatchQuizGeneration: vi.fn(),
  appendQuizBatch: vi.fn(),
  finishQuizGeneration: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('../../common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError }),
}));

import ActivityList from '../ActivityList.jsx';
import {
  getAttemptIdForActivity, getQuizAttempt, startQuizAttempt, saveAttemptAnswer, submitAttempt,
} from '../../../services/api/quizService';

const ACTIVITIES = [
  { id: 1, activity_type: 'quiz_completed', reference_id: 50, description: 'Scored 4/5 on "Networking" quiz', created_at: '2026-10-20T10:00:00.000Z' },
  { id: 2, activity_type: 'lesson_completed', reference_id: 9, description: 'Completed lesson: Subnetting', created_at: '2026-10-19T10:00:00.000Z' },
  { id: 3, activity_type: 'task_completed', reference_id: 3, description: 'Completed task: Read notes', created_at: '2026-10-18T10:00:00.000Z' },
  { id: 4, activity_type: 'resource_viewed', reference_id: 7, description: 'Viewed resource: Notes.pdf', created_at: '2026-10-17T10:00:00.000Z' },
];

const REVIEW = {
  attemptId: 999, quizId: 50, topic: 'Networking', quizType: 'multiple_choice', status: 'submitted',
  assessmentKind: 'practice', score: 4, total: 5, xpAwarded: 0,
  items: [
    { id: 1, question: 'What is a subnet?', options: ['A smaller network', 'A protocol'], yourAnswer: 'A smaller network', correctAnswer: 'A smaller network', explanation: 'Correct.', isCorrect: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ActivityList — quiz "View" button', () => {
  it('shows the View button only on quiz_completed rows', () => {
    render(<ActivityList activities={ACTIVITIES} />);
    expect(screen.getAllByRole('button', { name: /View/i })).toHaveLength(1);
    expect(screen.getByText(/Networking/)).toBeInTheDocument();
  });

  it('is suppressed entirely when showQuizView is false (admin viewing another student)', () => {
    render(<ActivityList activities={ACTIVITIES} showQuizView={false} />);
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument();
  });

  it('clicking View resolves the attempt and shows the existing review screen, with the answers', async () => {
    const user = userEvent.setup();
    getAttemptIdForActivity.mockResolvedValue({ attemptId: 999 });
    getQuizAttempt.mockResolvedValue(REVIEW);

    render(<ActivityList activities={ACTIVITIES} />);
    await user.click(screen.getByRole('button', { name: /View/i }));

    expect(getAttemptIdForActivity).toHaveBeenCalledWith(1);
    await waitFor(() => expect(getQuizAttempt).toHaveBeenCalledWith(999));
    await waitFor(() => expect(screen.getByText(/What is a subnet\?/)).toBeInTheDocument());

    // Read-only: nothing that could create an attempt, save an answer, or
    // submit one was ever called.
    expect(startQuizAttempt).not.toHaveBeenCalled();
    expect(saveAttemptAnswer).not.toHaveBeenCalled();
    expect(submitAttempt).not.toHaveBeenCalled();
  });

  it("another student's activity (or a deleted quiz/attempt) 404s — shows an error, opens nothing", async () => {
    const user = userEvent.setup();
    getAttemptIdForActivity.mockRejectedValue(new Error('This quiz is no longer available.'));

    render(<ActivityList activities={ACTIVITIES} />);
    await user.click(screen.getByRole('button', { name: /View/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This quiz is no longer available.'));
    expect(getQuizAttempt).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
