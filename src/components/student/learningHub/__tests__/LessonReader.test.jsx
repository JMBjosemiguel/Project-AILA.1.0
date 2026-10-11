import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/learningService', () => ({
  getLesson: vi.fn(),
  completeLesson: vi.fn(),
}));
vi.mock('../../../../services/api/aiToolsService', () => ({
  getStudyToolObjectives: vi.fn(),
}));
vi.mock('../../../common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import LessonReader from '../LessonReader.jsx';
import { getLesson, completeLesson } from '../../../../services/api/learningService';
import { getStudyToolObjectives } from '../../../../services/api/aiToolsService';

function detailPayload(overrides = {}) {
  return {
    lesson: {
      id: 10, title: 'Photosynthesis', content: '# Photosynthesis\n\nPlants make food.',
      completed: false, difficulty: 'medium', estimated_minutes: 8, personalizationLevel: null,
    },
    topic: { id: 2, title: 'Plant Biology' },
    module: { id: 1, title: 'Cell Biology' },
    subject: { id: 1, name: 'Biology Basics', goal: 'g' },
    definitions: [], examples: [], relatedResources: [],
    prerequisiteLesson: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  completeLesson.mockResolvedValue({ xpAwarded: 10 });
});

describe('LessonReader', () => {
  it('shows a loading state, then renders the lesson as a dialog', async () => {
    getLesson.mockResolvedValue(detailPayload());
    render(<LessonReader lessonId={10} onClose={vi.fn()} />);

    expect(screen.getByText(/can take up to a minute/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Biology Basics / Cell Biology / Plant Biology')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText(/~8 min/)).toBeInTheDocument();
  });

  it('moves focus into the dialog (the close button) on open', async () => {
    getLesson.mockResolvedValue(detailPayload());
    render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Close lesson' })).toHaveFocus();
  });

  it('returns focus to whatever was focused before the reader opened, once it closes', async () => {
    getLesson.mockResolvedValue(detailPayload());
    document.body.innerHTML = '<button id="trigger">open</button>';
    const trigger = document.getElementById('trigger');
    trigger.focus();

    const { unmount } = render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
  });

  it('Escape closes the reader', async () => {
    getLesson.mockResolvedValue(detailPayload());
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LessonReader lessonId={10} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('the close (X) button closes the reader', async () => {
    getLesson.mockResolvedValue(detailPayload());
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LessonReader lessonId={10} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Close lesson' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('locks body scroll while open', async () => {
    getLesson.mockResolvedValue(detailPayload());
    const { unmount } = render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Previous/Next are disabled at the ends and call through when enabled', async () => {
    getLesson.mockResolvedValue(detailPayload());
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<LessonReader lessonId={10} onClose={vi.fn()} hasPrevious={false} hasNext onPrevious={onPrevious} onNext={onNext} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Previous lesson' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next lesson' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(onNext).toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('Previous/Next show the target lesson title as a tooltip, only when enabled', async () => {
    getLesson.mockResolvedValue(detailPayload());
    render(
      <LessonReader
        lessonId={10} onClose={vi.fn()}
        hasPrevious hasNext
        previousLessonTitle="Cell Structure" nextLessonTitle="Cellular Respiration"
      />
    );
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Previous lesson' })).toHaveAttribute('title', 'Cell Structure');
    expect(screen.getByRole('button', { name: 'Next lesson' })).toHaveAttribute('title', 'Cellular Respiration');
  });

  it('Previous/Next have no tooltip when disabled, even if a title is passed', async () => {
    getLesson.mockResolvedValue(detailPayload());
    render(
      <LessonReader
        lessonId={10} onClose={vi.fn()}
        hasPrevious={false} hasNext={false}
        previousLessonTitle="Cell Structure" nextLessonTitle="Cellular Respiration"
      />
    );
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Previous lesson' })).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: 'Next lesson' })).not.toHaveAttribute('title');
  });

  it('the Completed button is still disabled but not faint — full-opacity readable colors', async () => {
    getLesson.mockResolvedValue(detailPayload({ lesson: { ...detailPayload().lesson, completed: true } }));
    render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument());

    const completedButton = screen.getByRole('button', { name: 'Completed' });
    expect(completedButton).toBeDisabled();
    expect(completedButton.className).toMatch(/!opacity-100/);
    expect(completedButton.className).toMatch(/!text-emerald-600/);
  });

  it('switching to a different lessonId (Previous/Next) refetches and clears stale content', async () => {
    getLesson.mockResolvedValueOnce(detailPayload({ lesson: { ...detailPayload().lesson, title: 'Lesson A' } }));
    const { rerender } = render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Lesson A')).toBeInTheDocument());

    getLesson.mockResolvedValueOnce(detailPayload({ lesson: { ...detailPayload().lesson, title: 'Lesson B' } }));
    rerender(<LessonReader lessonId={11} onClose={vi.fn()} />);

    expect(screen.getByText(/can take up to a minute/i)).toBeInTheDocument();
    expect(screen.queryByText('Lesson A')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Lesson B')).toBeInTheDocument());
    expect(getLesson).toHaveBeenCalledWith(11);
  });

  it('shows the content-unavailable banner with Retry when generation failed, and refetches on retry', async () => {
    getLesson.mockResolvedValueOnce(detailPayload({ lesson: { ...detailPayload().lesson, content: null } }));
    render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/couldn.t write this lesson/i)).toBeInTheDocument());

    getLesson.mockResolvedValueOnce(detailPayload());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());
    expect(getLesson).toHaveBeenCalledTimes(2);
  });

  it('Ask AILA, Generate Quiz, and Mark Complete behave exactly as before', async () => {
    getLesson.mockResolvedValue(detailPayload());
    const onAskAila = vi.fn();
    const onGenerateQuiz = vi.fn();
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<LessonReader lessonId={10} onClose={vi.fn()} onAskAila={onAskAila} onGenerateQuiz={onGenerateQuiz} onCompleted={onCompleted} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Ask AILA' }));
    expect(onAskAila).toHaveBeenCalledWith(expect.stringContaining('Photosynthesis'));

    await user.click(screen.getByRole('button', { name: 'Generate Quiz' }));
    expect(onGenerateQuiz).toHaveBeenCalledWith({ sourceType: 'lesson', sourceId: 10, topic: 'Plant Biology' });

    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));
    await waitFor(() => expect(completeLesson).toHaveBeenCalledWith(10));
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  });

  it('generates learning objectives on demand', async () => {
    getLesson.mockResolvedValue(detailPayload());
    getStudyToolObjectives.mockResolvedValue({ objectives: '- Objective one' });
    const user = userEvent.setup();
    render(<LessonReader lessonId={10} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Plants make food.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Generate learning objectives/i }));
    await waitFor(() => expect(screen.getByText('Objective one')).toBeInTheDocument());
  });
});
