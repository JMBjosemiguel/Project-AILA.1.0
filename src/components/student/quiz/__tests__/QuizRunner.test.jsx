import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/quizService', () => ({
  generateQuiz: vi.fn(),
  startQuizAttempt: vi.fn(),
  saveAttemptAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  getQuizAttempt: vi.fn(),
}));
vi.mock('../../../common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import QuizRunner from '../QuizRunner.jsx';
import { generateQuiz, startQuizAttempt, saveAttemptAnswer, submitAttempt, getQuizAttempt } from '../../../../services/api/quizService';

const ITEMS = [
  { id: 10, question: 'Capital of France?', options: ['Paris', 'Berlin'], orderIndex: 0 },
  { id: 11, question: 'Capital of Japan?', options: ['Kyoto', 'Tokyo'], orderIndex: 1 },
];

function startPayload(answers = [], currentIndex = 0, personalizationLevel = null) {
  return {
    attempt: { id: 77, quizId: 5, status: 'in_progress', currentIndex },
    quiz: { id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', personalizationLevel },
    items: ITEMS,
    answers,
  };
}

const REVIEW = {
  attemptId: 77, quizId: 5, topic: 'Geography', score: 1, total: 2, xpAwarded: 20,
  items: [
    { id: 10, question: 'Capital of France?', yourAnswer: 'Berlin', correctAnswer: 'Paris', explanation: 'Paris since 987.', isCorrect: false },
    { id: 11, question: 'Capital of Japan?', yourAnswer: 'Tokyo', correctAnswer: 'Tokyo', explanation: 'Tokyo since 1868.', isCorrect: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  saveAttemptAnswer.mockResolvedValue({ saved: true, attemptId: 77, currentIndex: 0 });
  submitAttempt.mockResolvedValue(REVIEW);
});

describe('QuizRunner — resumable formal quiz', () => {
  it('opens a fresh quiz by generating it then starting an attempt', async () => {
    const user = userEvent.setup();
    generateQuiz.mockResolvedValue({ id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', items: ITEMS });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(generateQuiz).toHaveBeenCalled();
    expect(startQuizAttempt).toHaveBeenCalledWith(5);
  });

  it('resumes an existing active attempt and repopulates saved answers', async () => {
    startQuizAttempt.mockResolvedValue(startPayload([{ questionId: 10, selectedAnswer: 'Berlin' }], 1));

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(startQuizAttempt).toHaveBeenCalledWith(5);
    expect(screen.getByText(/Resumed — 1 saved answer restored/i)).toBeInTheDocument();
    // the saved option is shown as selected
    expect(screen.getByRole('button', { name: 'Berlin' }).className).toMatch(/bg-primary-50/);
  });

  it('autosaves an answer to the server when the student picks an option', async () => {
    const user = userEvent.setup();
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await waitFor(() => expect(saveAttemptAnswer).toHaveBeenCalledWith(77, expect.objectContaining({ questionId: 10, selectedAnswer: 'Paris' })));
    await waitFor(() => expect(screen.getByText(/^Saved$/)).toBeInTheDocument());
  });

  it('shows a recoverable retry affordance when a save fails, then succeeds on retry', async () => {
    const user = userEvent.setup();
    startQuizAttempt.mockResolvedValue(startPayload());
    saveAttemptAnswer.mockRejectedValueOnce(new Error('network'));

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await waitFor(() => expect(screen.getByText(/Couldn.t save/i)).toBeInTheDocument());
    const retry = screen.getByRole('button', { name: /Retry/i });

    saveAttemptAnswer.mockResolvedValue({ saved: true });
    await user.click(retry);
    await waitFor(() => expect(screen.getByText(/^Saved$/)).toBeInTheDocument());
  });

  it('hides the answer key until submission, then reveals explanations after grading', async () => {
    const user = userEvent.setup();
    startQuizAttempt.mockResolvedValue(startPayload([
      { questionId: 10, selectedAnswer: 'Berlin' },
      { questionId: 11, selectedAnswer: 'Tokyo' },
    ]));

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));

    expect(screen.queryByText(/Correct answer:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paris since 987/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Check Answers/i }));

    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 2/)).toBeInTheDocument());
    expect(submitAttempt).toHaveBeenCalledWith(77);
    expect(screen.getByText(/Correct answer: Paris/)).toBeInTheDocument();
    expect(screen.getByText(/Paris since 987/)).toBeInTheDocument();
  });

  it('freezes the answers once the attempt is submitted', async () => {
    const user = userEvent.setup();
    startQuizAttempt.mockResolvedValue(startPayload([{ questionId: 10, selectedAnswer: 'Berlin' }]));

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());

    saveAttemptAnswer.mockClear();
    await user.click(screen.getByRole('button', { name: 'Paris' }));
    expect(saveAttemptAnswer).not.toHaveBeenCalled();
  });

  it('shows a "Personalized for you" badge only when generation was performance-aware', async () => {
    startQuizAttempt.mockResolvedValueOnce(startPayload([], 0, 'performance_aware'));
    const { unmount } = render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    expect(screen.getByText(/Personalized for you/i)).toBeInTheDocument();
    unmount();

    startQuizAttempt.mockResolvedValueOnce(startPayload([], 0, 'basic'));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    expect(screen.queryByText(/Personalized for you/i)).not.toBeInTheDocument();
  });

  it('re-fetches server state on a fresh mount (refresh / reopen)', async () => {
    startQuizAttempt.mockResolvedValue(startPayload([{ questionId: 10, selectedAnswer: 'Berlin' }]));

    const { unmount } = render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    expect(startQuizAttempt).toHaveBeenCalledTimes(1);
    unmount();

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    expect(startQuizAttempt).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Berlin' }).className).toMatch(/bg-primary-50/);
  });

  it('formal assessment: shows kind + passing score, and a pass/fail banner after submit', async () => {
    const user = userEvent.setup();
    startQuizAttempt.mockResolvedValue({
      attempt: { id: 77, quizId: 5, status: 'in_progress', currentIndex: 0 },
      quiz: { id: 5, topic: 'Indexes', quizType: 'multiple_choice', assessmentKind: 'module_checkpoint', passingScore: 70 },
      items: ITEMS, answers: [],
    });
    submitAttempt.mockResolvedValue({
      ...REVIEW, assessmentKind: 'module_checkpoint', passed: false, passingScore: 70, percent: 40,
      recommendation: { message: 'Review the "Indexes" module, then try the checkpoint again.' },
    });

    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Capital of France?/));
    expect(screen.getByText('Module Checkpoint')).toBeInTheDocument();
    expect(screen.getByText(/Passing 70%/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/Not passed — 40% \(passing 70%\)/)).toBeInTheDocument());
    expect(screen.getByText(/Review the "Indexes" module/)).toBeInTheDocument();
  });

  it('review mode: loads a submitted attempt, shows the key, and has no submit button', async () => {
    getQuizAttempt.mockResolvedValue({
      attemptId: 77, topic: 'Indexes', quizType: 'multiple_choice', status: 'submitted',
      assessmentKind: 'module_checkpoint', passed: true, passingScore: 70, percent: 90, score: 9, total: 10,
      items: [
        { id: 10, question: 'Capital of France?', options: ['Paris', 'Berlin'], yourAnswer: 'Paris', correctAnswer: 'Paris', explanation: 'Paris since 987.', isCorrect: true },
        { id: 11, question: 'Capital of Japan?', options: ['Kyoto', 'Tokyo'], yourAnswer: 'Kyoto', correctAnswer: 'Tokyo', explanation: 'Tokyo since 1868.', isCorrect: false },
      ],
    });

    render(<QuizRunner reviewAttemptId={77} onClose={vi.fn()} />);
    await waitFor(() => expect(getQuizAttempt).toHaveBeenCalledWith(77));
    await waitFor(() => expect(screen.getByText(/Passed — 90%/)).toBeInTheDocument());
    expect(screen.getByText(/Correct answer: Tokyo/)).toBeInTheDocument();
    expect(screen.getByText(/Tokyo since 1868/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check Answers/i })).not.toBeInTheDocument();
    expect(startQuizAttempt).not.toHaveBeenCalled();
  });
});
