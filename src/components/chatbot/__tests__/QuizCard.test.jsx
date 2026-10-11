import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizCard from '../QuizCard.jsx';

function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    question: `Question ${i + 1}?`,
    options: ['a', 'b', 'c', 'd'],
    correctAnswer: 'a',
    explanation: `Explanation ${i + 1}.`,
  }));
}

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

    // Only 1 of 2 items answered — this is a non-chat QuizCard (no
    // onSaveAsQuiz), so the pre-submit "unanswered" warning gates the submit.
    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await user.click(screen.getByRole('button', { name: /Submit anyway/i }));
    expect(screen.getByRole('button', { name: /Checking/i })).toBeDisabled();

    resolve(gradedResult);
    await waitFor(() => expect(screen.getByText(/You scored/i)).toBeInTheDocument());
  });
});

describe('QuizCard — long quiz taking (navigator + pagination)', () => {
  it('a short quiz (<=10 items) shows no navigator or pagination', () => {
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(5) };
    render(<QuizCard quiz={quiz} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('group', { name: /Question navigator/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it('a long quiz (>10 items) shows a navigator grid and pages 10 at a time', async () => {
    const user = userEvent.setup();
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(25) };
    render(<QuizCard quiz={quiz} onSubmit={vi.fn()} />);

    expect(screen.getByText('Questions 1–10 of 25')).toBeInTheDocument();
    expect(screen.getByText(/Question 1\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Question 11\?/)).not.toBeInTheDocument();
    const navigator = screen.getByRole('group', { name: /Question navigator/i });
    expect(within(navigator).getAllByRole('button')).toHaveLength(25);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Questions 11–20 of 25')).toBeInTheDocument();
    expect(screen.getByText(/Question 11\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Question 1\?/)).not.toBeInTheDocument();
  });

  it("tapping a navigator number jumps straight to that question's page", async () => {
    const user = userEvent.setup();
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(25) };
    render(<QuizCard quiz={quiz} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Question 23,/i }));
    expect(screen.getByText('Questions 21–25 of 25')).toBeInTheDocument();
    expect(screen.getByText(/Question 23\?/)).toBeInTheDocument();
  });

  it('answered questions are visually distinguished in the navigator', async () => {
    const user = userEvent.setup();
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(15) };
    render(<QuizCard quiz={quiz} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Question 1, unanswered/i })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'a' })[0]);
    expect(screen.getByRole('button', { name: /Question 1, answered/i })).toBeInTheDocument();
  });

  it('resume returns to the page containing the saved position', () => {
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(30) };
    render(<QuizCard quiz={quiz} onSubmit={vi.fn()} initialIndex={22} />);
    expect(screen.getByText('Questions 21–30 of 30')).toBeInTheDocument();
  });
});

describe('QuizCard — results (filter + collapsed explanations)', () => {
  it('shows a percentage alongside the score', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(gradedResult);
    render(<QuizCard quiz={takePayload} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Berlin' }));
    await user.click(screen.getByRole('button', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 2 \(50%\)/)).toBeInTheDocument());
  });

  it('"Wrong only" hides correctly-answered items from the results list', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(gradedResult);
    render(<QuizCard quiz={takePayload} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Berlin' }));
    await user.click(screen.getByRole('button', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());

    expect(screen.getByText(/Capital of Japan\?/)).toBeInTheDocument(); // item 2 is correct

    await user.click(screen.getByRole('radio', { name: /Wrong only/i }));
    expect(screen.getByText(/Capital of France\?/)).toBeInTheDocument(); // wrong, stays
    expect(screen.queryByText(/Capital of Japan\?/)).not.toBeInTheDocument(); // correct, hidden

    await user.click(screen.getByRole('radio', { name: 'All (2)' }));
    expect(screen.getByText(/Capital of Japan\?/)).toBeInTheDocument();
  });

  it('explanations are collapsed by default for quizzes over 20 items, and can be expanded individually or all at once', async () => {
    const user = userEvent.setup();
    const items = makeItems(22);
    const quiz = { topic: 'T', quizType: 'multiple_choice', items };
    const result = {
      items: items.map((item) => ({ id: item.id, correctAnswer: 'a', explanation: item.explanation, isCorrect: true })),
    };
    const onSubmit = vi.fn().mockResolvedValue(result);
    render(<QuizCard quiz={quiz} onSubmit={onSubmit} />);

    // 22 items paginates the taking view too — bypass answering every page
    // via "Submit anyway" since the mocked onSubmit ignores what was
    // actually selected and returns a canned fully-graded result anyway.
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await user.click(screen.getByRole('button', { name: /Submit anyway/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());

    expect(screen.queryByText(/Explanation 1\./)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Show explanation/i }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /Show explanation/i })[0]);
    expect(screen.getByText(/Explanation 1\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Expand all/i }));
    expect(screen.getByText(/Explanation 22\./)).toBeInTheDocument();
  });

  it('explanations for a short (<=20 item) quiz are never collapsed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(gradedResult);
    render(<QuizCard quiz={takePayload} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Berlin' }));
    await user.click(screen.getByRole('button', { name: 'Tokyo' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/Since 1868/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Show explanation/i })).not.toBeInTheDocument();
  });
});

describe('QuizCard — chat quiz cards are never affected by long-quiz UI', () => {
  it('a chat quiz with many items shows no navigator, pagination, filter, or collapsed explanations', async () => {
    const user = userEvent.setup();
    const items = makeItems(30).map(({ id, ...rest }) => rest);
    const quiz = { topic: 'T', quizType: 'multiple_choice', items };
    render(<QuizCard quiz={quiz} onSaveAsQuiz={vi.fn()} saveAsQuizState="idle" />);

    expect(screen.queryByText(/Questions \d+–\d+ of/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Question navigator/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Question 1\?/)).toBeInTheDocument();
    expect(screen.getByText(/Question 30\?/)).toBeInTheDocument(); // all items render at once, no paging

    const optionButtons = screen.getAllByRole('button', { name: 'a' });
    for (const button of optionButtons) {
      // eslint-disable-next-line no-await-in-loop
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());
    expect(screen.queryByRole('radio', { name: /Wrong only/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show explanation/i })).not.toBeInTheDocument();
    expect(screen.getByText('Explanation 1.')).toBeInTheDocument(); // shown inline, never collapsed
  });

  it('a chat quiz with unanswered items still submits immediately — no pre-submit warning', async () => {
    const user = userEvent.setup();
    const quiz = { topic: 'T', quizType: 'multiple_choice', items: makeItems(2).map(({ id, ...rest }) => rest) };
    render(<QuizCard quiz={quiz} onSaveAsQuiz={vi.fn()} saveAsQuizState="idle" />);

    await user.click(screen.getByRole('button', { name: /Check Answers/i })); // nothing answered
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());
  });
});
