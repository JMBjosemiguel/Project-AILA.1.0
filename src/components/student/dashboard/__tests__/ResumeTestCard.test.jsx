import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ResumeTestCard from '../ResumeTestCard.jsx';

const attempt = (overrides) => ({
  attemptId: 1, quizId: 10, topic: 'Fluid balance', total: 10, answered: 4, progressPercent: 40,
  timeLimitSeconds: null, remainingSeconds: null, expired: false,
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe('ResumeTestCard — time left', () => {
  it('shows the server\'s remaining time for a timed attempt and counts down live', () => {
    vi.useFakeTimers();
    render(<ResumeTestCard attempts={[attempt({ timeLimitSeconds: 300, remainingSeconds: 252 })]} onResume={vi.fn()} />);
    expect(screen.getByText('4:12 left')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('4:09 left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('shows nothing extra for an untimed attempt', () => {
    render(<ResumeTestCard attempts={[attempt()]} onResume={vi.fn()} />);
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    expect(screen.getByText('4/10 answered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('switches to "Time\'s up, see results" when the countdown reaches 0', () => {
    vi.useFakeTimers();
    render(<ResumeTestCard attempts={[attempt({ timeLimitSeconds: 300, remainingSeconds: 2 })]} onResume={vi.fn()} />);
    expect(screen.getByText('0:02 left')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Time's up, see results" })).toBeInTheDocument();
  });

  it('an already-expired attempt keeps "Time\'s up, see results" and shows no timer', () => {
    render(<ResumeTestCard attempts={[attempt({ timeLimitSeconds: 300, remainingSeconds: 0, expired: true })]} onResume={vi.fn()} />);
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Time's up, see results" })).toBeInTheDocument();
  });
});
