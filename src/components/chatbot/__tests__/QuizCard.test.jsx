import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizCard from '../QuizCard.jsx';

const takePayload = {
  topic: 'Geography',
  quizType: 'multiple_choice',
  items: [
    { id: 1, question: 'Capital of France?', options: ['Paris', 'Berlin'] },
    { id: 2, question: 'Capital of Japan?', options: ['Kyoto', 'Tokyo'] },
  ],
};

const gradedResult = {
  score: 1,
  total: 2,
  xpAwarded: 10,
  items: [
    { id: 1, correctAnswer: 'Paris', explanation: 'Paris since 987.', yourAnswer: 'Berlin', isCorrect: false },
    { id: 2, correctAnswer: 'Tokyo', explanation: 'Since 1868.', yourAnswer: 'Tokyo', isCorrect: true },
  ],
};

describe('QuizCard — take vs review', () => {
  it('does not render any correct answer or explanation before submission (persisted quiz)', () => {
    render(<QuizCard quiz={takePayload} onSubmit={vi.fn()} />);
    // options are shown, answers/explanations are not
    expect(screen.getByRole('button', { name: 'Paris' })).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paris since 987/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You scored/i)).not.toBeInTheDocument();
  });

  it('grades a persisted quiz from the server result and then shows the explanations', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(gradedResult);
    render(<QuizCard quiz={takePayload} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Berlin' }));
    await user.click(screen.getByRole('button', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));

    // it sent only the answers, not any grading claim
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 1, selectedAnswer: 'Berlin' },
      { questionId: 2, selectedAnswer: 'Tokyo' },
    ]);

    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 2/)).toBeInTheDocument());
    expect(screen.getByText(/Correct answer: Paris/)).toBeInTheDocument();
    expect(screen.getByText(/Paris since 987/)).toBeInTheDocument();
    expect(screen.getByText(/Since 1868/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check Answers/i })).not.toBeInTheDocument();
  });

  it('self-checks an informal chatbot quiz from its inline answer key when there is no onSubmit', async () => {
    const user = userEvent.setup();
    const inlineQuiz = {
      topic: 'Practice',
      quizType: 'multiple_choice',
      items: [
        { question: 'Capital of France?', options: ['Paris', 'Berlin'], correctAnswer: 'Paris', explanation: 'Paris is correct.' },
      ],
    };
    render(<QuizCard quiz={inlineQuiz} />);

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));

    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 1/)).toBeInTheDocument());
    expect(screen.getByText(/Paris is correct/)).toBeInTheDocument();
  });

  it('reports answer + review changes through onLocalStateChange (chatbot state lift)', async () => {
    const user = userEvent.setup();
    const onLocalStateChange = vi.fn();
    const inlineQuiz = {
      topic: 'Practice', quizType: 'multiple_choice',
      items: [{ question: 'Capital of France?', options: ['Paris', 'Berlin'], correctAnswer: 'Paris', explanation: 'Paris is correct.' }],
    };
    render(<QuizCard quiz={inlineQuiz} onLocalStateChange={onLocalStateChange} />);

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    expect(onLocalStateChange).toHaveBeenLastCalledWith({ answers: { 0: 'Paris' }, review: null });

    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => {
      const last = onLocalStateChange.mock.calls.at(-1)[0];
      expect(last.answers).toEqual({ 0: 'Paris' });
      expect(Array.isArray(last.review)).toBe(true);
    });
  });

  it('rehydrates from localState — selected answers and the submitted review survive a remount', () => {
    const inlineQuiz = {
      topic: 'Practice', quizType: 'multiple_choice',
      items: [{ question: 'Capital of France?', options: ['Paris', 'Berlin'], correctAnswer: 'Paris', explanation: 'Paris is correct.' }],
    };
    render(
      <QuizCard
        quiz={inlineQuiz}
        localState={{ answers: { 0: 'Paris' }, review: [{ correctAnswer: 'Paris', explanation: 'Paris is correct.', isCorrect: true }] }}
      />
    );
    expect(screen.getByText(/You scored 1 \/ 1/)).toBeInTheDocument();
    expect(screen.getByText(/Paris is correct/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check Answers/i })).not.toBeInTheDocument();
  });

  it('shows "Save as Quiz" only when onSaveAsQuiz is provided, and reflects its state', async () => {
    const user = userEvent.setup();
    const onSaveAsQuiz = vi.fn();
    const inlineQuiz = {
      topic: 'Practice', quizType: 'multiple_choice',
      items: [{ question: 'Q?', options: ['a', 'b'], correctAnswer: 'a', explanation: 'x' }],
    };
    const { rerender } = render(<QuizCard quiz={inlineQuiz} />);
    expect(screen.queryByRole('button', { name: /Save as Quiz/i })).not.toBeInTheDocument();

    rerender(<QuizCard quiz={inlineQuiz} onSaveAsQuiz={onSaveAsQuiz} saveAsQuizState="idle" />);
    await user.click(screen.getByRole('button', { name: /Save as Quiz/i }));
    expect(onSaveAsQuiz).toHaveBeenCalled();

    rerender(<QuizCard quiz={inlineQuiz} onSaveAsQuiz={onSaveAsQuiz} saveAsQuizState="saved" />);
    expect(screen.getByRole('button', { name: /Saved/i })).toBeDisabled();
  });

  it('keeps the submit button disabled while grading is in flight', async () => {
    const user = userEvent.setup();
    let resolve;
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<QuizCard quiz={takePayload} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    expect(screen.getByRole('button', { name: /Checking/i })).toBeDisabled();

    resolve(gradedResult);
    await waitFor(() => expect(screen.getByText(/You scored/i)).toBeInTheDocument());
  });
});
