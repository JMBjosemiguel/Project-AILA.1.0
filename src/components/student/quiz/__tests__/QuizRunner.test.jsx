import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/quizService', () => ({
  generateQuiz: vi.fn(),
  startQuizAttempt: vi.fn(),
  saveAttemptAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  getQuizAttempt: vi.fn(),
  startBatchQuizGeneration: vi.fn(),
  appendQuizBatch: vi.fn(),
  finishQuizGeneration: vi.fn(),
}));
vi.mock('../../../common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import QuizRunner from '../QuizRunner.jsx';
import {
  generateQuiz, startQuizAttempt, saveAttemptAnswer, submitAttempt, getQuizAttempt,
  startBatchQuizGeneration, appendQuizBatch, finishQuizGeneration,
} from '../../../../services/api/quizService';

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

describe('QuizRunner — count picker (presets + custom)', () => {
  it('defaults to the 5 preset, with no custom box shown', async () => {
    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText(/Custom number of items/i)).not.toBeInTheDocument();
  });

  it('clicking a preset generates with that exact count, no custom box involved', async () => {
    const user = userEvent.setup();
    generateQuiz.mockResolvedValue({ id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', items: ITEMS });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: '15' }));
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(generateQuiz).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 15 })));
  });

  it('"Custom" reveals a 1-150 box; the field can go genuinely empty while typing', async () => {
    const user = userEvent.setup();
    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));

    const input = screen.getByLabelText(/Custom number of items/i);
    expect(input).toHaveAttribute('max', '150');
    expect(input).toHaveValue(5);
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.type(input, '10');
    expect(input).toHaveValue(10); // not "010" — Number('') never gets bound back into the input
  });

  it('clamps an empty custom field to the minimum (1) only when the quiz is actually generated', async () => {
    const user = userEvent.setup();
    generateQuiz.mockResolvedValue({ id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', items: ITEMS });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    expect(input).toHaveValue(null);

    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));
    await waitFor(() => expect(generateQuiz).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 1 })));
  });

  it('clamps a custom value over 150 down to 150 when generating', async () => {
    const user = userEvent.setup();
    startBatchQuizGeneration.mockResolvedValue({ quizId: 9, target: 150, batchSize: 15, subtopics: ['A', 'B'] });
    appendQuizBatch.mockResolvedValue({ quizId: 9, added: 15, total: 15, target: 150 });
    finishQuizGeneration.mockResolvedValue({ quizId: 9, target: 150, actual: 15 });

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '9999');

    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));
    await waitFor(() => expect(startBatchQuizGeneration).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 150 })));
  });
});

describe('QuizRunner — batched generation (counts above 20)', () => {
  it('a count of 20 or below never calls the batched endpoints', async () => {
    const user = userEvent.setup();
    generateQuiz.mockResolvedValue({ id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', items: ITEMS });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: '20' }));
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(generateQuiz).toHaveBeenCalled());
    expect(startBatchQuizGeneration).not.toHaveBeenCalled();
  });

  it('a count above 20 drives start -> batches -> finish and shows progress, then opens the quiz once the target is met', async () => {
    const user = userEvent.setup();
    startBatchQuizGeneration.mockResolvedValue({ quizId: 42, target: 30, batchSize: 15, subtopics: ['Part 1', 'Part 2'] });
    // Part 2 is held open so the intermediate progress state is observable
    // before the flow proceeds to finish — otherwise two instantly-resolving
    // batches can settle before the test ever gets to inspect that state.
    let resolvePart2;
    appendQuizBatch.mockImplementation(async (_quizId, { subtopic }) => {
      if (subtopic === 'Part 1') return { quizId: 42, added: 15, total: 15, target: 30 };
      return new Promise((resolve) => { resolvePart2 = resolve; });
    });
    finishQuizGeneration.mockResolvedValue({ quizId: 42, target: 30, actual: 30 });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '30');
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(screen.getByText(/15 of 30/)).toBeInTheDocument());
    resolvePart2({ quizId: 42, added: 15, total: 30, target: 30 });

    await waitFor(() => expect(finishQuizGeneration).toHaveBeenCalledWith(42));
    expect(appendQuizBatch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(startQuizAttempt).toHaveBeenCalledWith(42);
  });

  it('a short result shows "Use these N" / "Try to add the rest" instead of opening the quiz', async () => {
    const user = userEvent.setup();
    startBatchQuizGeneration.mockResolvedValue({ quizId: 7, target: 50, batchSize: 15, subtopics: ['A', 'B', 'C', 'D'] });
    appendQuizBatch.mockResolvedValue({ quizId: 7, added: 10, total: 32, target: 50 });
    finishQuizGeneration.mockResolvedValue({ quizId: 7, target: 50, actual: 32 });

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '50');
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(screen.getByText('AILA made 32 of 50 questions.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Use these 32' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try to add the rest/i })).toBeInTheDocument();
  });

  it('"Use these N" opens the quiz with the partial count, without requesting more batches', async () => {
    const user = userEvent.setup();
    startBatchQuizGeneration.mockResolvedValue({ quizId: 7, target: 50, batchSize: 15, subtopics: ['A', 'B', 'C', 'D'] });
    appendQuizBatch.mockResolvedValue({ quizId: 7, added: 10, total: 32, target: 50 });
    finishQuizGeneration.mockResolvedValue({ quizId: 7, target: 50, actual: 32 });
    startQuizAttempt.mockResolvedValue(startPayload());

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '50');
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));
    await waitFor(() => expect(screen.getByText('AILA made 32 of 50 questions.')).toBeInTheDocument());

    appendQuizBatch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Use these 32' }));
    await waitFor(() => expect(startQuizAttempt).toHaveBeenCalledWith(7));
    expect(appendQuizBatch).not.toHaveBeenCalled();
  });

  it('"Try to add the rest" requests more batches for the shortfall, then re-finishes', async () => {
    const user = userEvent.setup();
    startBatchQuizGeneration.mockResolvedValue({ quizId: 7, target: 50, batchSize: 15, subtopics: ['A', 'B', 'C', 'D'] });
    appendQuizBatch.mockResolvedValue({ quizId: 7, added: 10, total: 32, target: 50 });
    finishQuizGeneration.mockResolvedValueOnce({ quizId: 7, target: 50, actual: 32 });

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '50');
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));
    await waitFor(() => expect(screen.getByText('AILA made 32 of 50 questions.')).toBeInTheDocument());

    appendQuizBatch.mockClear();
    finishQuizGeneration.mockResolvedValueOnce({ quizId: 7, target: 50, actual: 50 });
    startQuizAttempt.mockResolvedValue(startPayload());
    await user.click(screen.getByRole('button', { name: /Try to add the rest/i }));

    await waitFor(() => expect(appendQuizBatch).toHaveBeenCalled());
    await waitFor(() => expect(startQuizAttempt).toHaveBeenCalledWith(7));
  });

  it('Cancel stops new batches from being sent; the flow still settles into a short result', async () => {
    const user = userEvent.setup();
    // 5 subtopics but only 3 concurrent slots — "D" and "E" stay queued behind
    // "A"/"B"/"C". None of A/B/C resolve until the test says so, so there is
    // no race where a freed worker could grab "D" before Cancel is clicked.
    startBatchQuizGeneration.mockResolvedValue({ quizId: 11, target: 75, batchSize: 15, subtopics: ['A', 'B', 'C', 'D', 'E'] });
    const resolvers = {};
    appendQuizBatch.mockImplementation(async (_quizId, { subtopic }) => (
      new Promise((resolve) => { resolvers[subtopic] = resolve; })
    ));
    finishQuizGeneration.mockResolvedValue({ quizId: 11, target: 75, actual: 45 });

    render(<QuizRunner request={{ topic: 'Geography' }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText(/Custom number of items/i);
    await user.clear(input);
    await user.type(input, '75');
    await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

    await waitFor(() => expect(appendQuizBatch).toHaveBeenCalledTimes(3)); // A, B, C dispatched up front (concurrency 3)
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    resolvers.A({ quizId: 11, added: 15, total: 15, target: 75 });
    resolvers.B({ quizId: 11, added: 15, total: 30, target: 75 });
    resolvers.C({ quizId: 11, added: 15, total: 45, target: 75 });

    await waitFor(() => expect(screen.getByText('AILA made 45 of 75 questions.')).toBeInTheDocument());
    // "D" and "E" were never dispatched because Cancel stopped new pickups.
    expect(appendQuizBatch).toHaveBeenCalledTimes(3);
  });
});
