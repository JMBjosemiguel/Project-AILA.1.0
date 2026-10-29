import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  recordQuizTabSwitch: vi.fn(),
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('../../../common/Toast', () => ({ useToast: () => toast }));
vi.mock('../../../../services/api/shareService', () => ({
  getShareStatus: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  absoluteShareUrl: vi.fn((path) => `https://aila.local${path}`),
}));

import QuizRunner from '../QuizRunner.jsx';
import QuizTimer, { formatClock } from '../QuizTimer.jsx';
import {
  startQuizAttempt, saveAttemptAnswer, submitAttempt, recordQuizTabSwitch,
} from '../../../../services/api/quizService';
import { getShareStatus } from '../../../../services/api/shareService';

const ITEMS = [
  { id: 10, question: 'Capital of France?', options: ['Paris', 'Berlin'], orderIndex: 0 },
  { id: 11, question: 'Capital of Japan?', options: ['Kyoto', 'Tokyo'], orderIndex: 1 },
];

function startPayload({ remainingSeconds = null, timerEligible = true } = {}) {
  return {
    attempt: {
      id: 77, quizId: 5, status: 'in_progress', currentIndex: 0,
      timeLimitSeconds: remainingSeconds == null ? null : 600, remainingSeconds, tabSwitchCount: 0,
    },
    quiz: { id: 5, topic: 'Geography', quizType: 'multiple_choice', difficulty: 'medium', timerEligible },
    items: ITEMS,
    answers: [],
  };
}

const REVIEW = {
  attemptId: 77, quizId: 5, topic: 'Geography', quizType: 'multiple_choice', score: 1, total: 2, xpAwarded: 20,
  assessmentKind: 'practice', timedOut: true,
  items: [
    { id: 10, question: 'Capital of France?', options: ['Paris', 'Berlin'], yourAnswer: 'Berlin', correctAnswer: 'Paris', explanation: 'Paris since 987.', isCorrect: false },
    { id: 11, question: 'Capital of Japan?', options: ['Kyoto', 'Tokyo'], yourAnswer: 'Tokyo', correctAnswer: 'Tokyo', explanation: 'Tokyo since 1868.', isCorrect: true },
  ],
};

const NOTICE = 'Leaving this page during the quiz is recorded.';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  saveAttemptAnswer.mockResolvedValue({ saved: true, attemptId: 77, currentIndex: 0 });
  submitAttempt.mockResolvedValue(REVIEW);
  recordQuizTabSwitch.mockResolvedValue({ recorded: true, tabSwitchCount: 1 });
  getShareStatus.mockResolvedValue({ visibility: 'private', shared: false });
});

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('QuizTimer', () => {
  afterEach(() => vi.useRealTimers());

  it('formats minutes and seconds', () => {
    expect(formatClock(3600)).toBe('60:00');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(0)).toBe('0:00');
  });

  it('counts down, warns once at 1 minute left, and expires once at 0', () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onExpire = vi.fn();
    render(<QuizTimer remainingSeconds={62} onWarning={onWarning} onExpire={onExpire} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:02');
    expect(onWarning).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
    expect(onWarning).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(30000); });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(31000); });
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('QuizRunner — time limit picker', () => {
  it('asks for a time limit before starting a timed quiz, then starts with the chosen limit', async () => {
    const user = userEvent.setup();
    startQuizAttempt
      .mockResolvedValueOnce({ needsTimeLimit: true, quiz: { id: 5, topic: 'Geography', assessmentKind: 'practice', passingScore: null } })
      .mockResolvedValueOnce(startPayload({ remainingSeconds: 600 }));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    const picker = await screen.findByRole('radiogroup', { name: 'Time limit' });
    const labels = within(picker).getAllByRole('radio').map((radio) => radio.textContent);
    expect(labels).toEqual(['No limit', '5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '60 min']);
    expect(within(picker).getByRole('radio', { name: 'No limit' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(startQuizAttempt).toHaveBeenCalledWith(5);

    await user.click(within(picker).getByRole('radio', { name: '10 min' }));
    await user.click(screen.getByRole('button', { name: 'Start quiz' }));

    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(startQuizAttempt).toHaveBeenLastCalledWith(5, { timeLimitMinutes: 10 });
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
  });

  it('"No limit" starts with timeLimitMinutes null and shows no countdown', async () => {
    const user = userEvent.setup();
    startQuizAttempt
      .mockResolvedValueOnce({ needsTimeLimit: true, quiz: { id: 5, topic: 'Geography', assessmentKind: 'practice', passingScore: null } })
      .mockResolvedValueOnce(startPayload({ remainingSeconds: null }));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Start quiz' }));

    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(startQuizAttempt).toHaveBeenLastCalledWith(5, { timeLimitMinutes: null });
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('a resumed timed attempt continues from the server\'s remaining time, with no picker', async () => {
    startQuizAttempt.mockResolvedValue(startPayload({ remainingSeconds: 125 }));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('timer')).toHaveTextContent('2:05'));
    expect(screen.queryByRole('radiogroup', { name: 'Time limit' })).not.toBeInTheDocument();
    expect(startQuizAttempt).toHaveBeenCalledTimes(1);
  });

  it('auto-submits at 0 and shows the review with a timed-out notice', async () => {
    startQuizAttempt.mockResolvedValue(startPayload({ remainingSeconds: 1 }));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    await waitFor(() => expect(submitAttempt).toHaveBeenCalledWith(77), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText(/Time ran out, so your saved answers were submitted automatically/)).toBeInTheDocument());
    expect(screen.getByText(/You scored 1 \/ 2/)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/1 minute left/));
  });

  it('an attempt whose time ran out while away opens straight into its review', async () => {
    startQuizAttempt.mockResolvedValue({ timedOut: true, review: REVIEW });
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Time ran out/)).toBeInTheDocument());
    expect(screen.getByText(/You scored 1 \/ 2 \(50%\) · Grade 75%/)).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});

describe('QuizRunner — tab switches', () => {
  it('records each time the student leaves the quiz, once per leave', async () => {
    startQuizAttempt.mockResolvedValue(startPayload());
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());
    expect(screen.getByText(NOTICE)).toBeInTheDocument();

    // Switching tabs fires blur and then visibilitychange: one leave.
    act(() => { window.dispatchEvent(new Event('blur')); setVisibility('hidden'); });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(1);
    expect(recordQuizTabSwitch).toHaveBeenCalledWith(77);

    act(() => { setVisibility('visible'); window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(2);
  });

  it('one leave counts once, whichever order blur and visibilitychange fire in, and however often they repeat', async () => {
    startQuizAttempt.mockResolvedValue(startPayload());
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());

    // Tab hidden first, then the window blurs, then repeats while still away.
    act(() => {
      setVisibility('hidden');
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('blur'));
      setVisibility('hidden');
    });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(1);

    // Coming back in either order, then leaving again, is the second leave.
    act(() => { window.dispatchEvent(new Event('focus')); setVisibility('visible'); });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(1);
    act(() => { setVisibility('hidden'); window.dispatchEvent(new Event('blur')); });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(2);
  });

  it('leaving and coming back 14 times records exactly 14, not 28', async () => {
    startQuizAttempt.mockResolvedValue(startPayload());
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());

    for (let i = 0; i < 14; i += 1) {
      act(() => {
        // Alternate the browser orders: blur before hidden, then hidden before blur.
        if (i % 2) { window.dispatchEvent(new Event('blur')); setVisibility('hidden'); }
        else { setVisibility('hidden'); window.dispatchEvent(new Event('blur')); }
      });
      act(() => { setVisibility('visible'); window.dispatchEvent(new Event('focus')); });
    }
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(14);
  });

  it('switching to another window without hiding the tab (blur only) still counts once per leave', async () => {
    startQuizAttempt.mockResolvedValue(startPayload());
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());

    act(() => { window.dispatchEvent(new Event('blur')); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(recordQuizTabSwitch).toHaveBeenCalledTimes(2);
  });

  it('chat quizzes (not timer-eligible) show no notice and record nothing', async () => {
    startQuizAttempt.mockResolvedValue(startPayload({ timerEligible: false }));
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());

    act(() => { window.dispatchEvent(new Event('blur')); setVisibility('hidden'); });
    expect(recordQuizTabSwitch).not.toHaveBeenCalled();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('stops recording once the quiz is submitted', async () => {
    const user = userEvent.setup();
    submitAttempt.mockResolvedValue({ ...REVIEW, timedOut: false });
    startQuizAttempt.mockResolvedValue(startPayload());
    render(<QuizRunner resumeQuizId={5} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Capital of France?/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Berlin' }));
    await user.click(screen.getByRole('button', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: /Check answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());

    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(recordQuizTabSwitch).not.toHaveBeenCalled();
  });
});
