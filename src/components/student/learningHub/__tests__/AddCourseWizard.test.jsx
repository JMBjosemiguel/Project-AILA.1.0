import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/learningService', () => ({
  generateCourse: vi.fn(),
}));
vi.mock('../../../common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import AddCourseWizard from '../AddCourseWizard.jsx';
import { generateCourse } from '../../../../services/api/learningService';

beforeEach(() => {
  vi.clearAllMocks();
  generateCourse.mockResolvedValue({ subjectId: 42, personalizationLevel: 'basic' });
});

describe('AddCourseWizard', () => {
  it('"More options" is collapsed by default — only the name and purpose are visible', () => {
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={vi.fn()} />);
    expect(screen.getByLabelText('Course name')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: "What's this course for?" })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Difficulty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Course length' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Learning goal/i)).not.toBeInTheDocument();
  });

  it('the quick flow (course name only) still works, sending the sensible defaults', async () => {
    const user = userEvent.setup();
    const onGenerated = vi.fn();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={onGenerated} />);

    await user.type(screen.getByLabelText('Course name'), 'Organic Chemistry');
    await user.click(screen.getByRole('button', { name: 'Generate course' }));

    await waitFor(() => expect(generateCourse).toHaveBeenCalledWith({
      courseName: 'Organic Chemistry', difficulty: 'beginner', goal: '', purpose: 'from_scratch', length: 'standard', focus: [],
    }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(42));
  });

  it('requires a course name, nothing else', async () => {
    const user = userEvent.setup();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Generate course' }));
    expect(screen.getByText(/please fill in the course name/i)).toBeInTheDocument();
    expect(generateCourse).not.toHaveBeenCalled();
  });

  it('picking a purpose sends it, even without opening More options', async () => {
    const user = userEvent.setup();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={vi.fn()} />);

    await user.type(screen.getByLabelText('Course name'), 'NLE Review');
    await user.click(screen.getByRole('radio', { name: 'Board exam (NLE) review' }));
    await user.click(screen.getByRole('button', { name: 'Generate course' }));

    await waitFor(() => expect(generateCourse).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'board_exam' })));
  });

  it('"More options" reveals difficulty, length, focus, and an optional goal — and they are all sent', async () => {
    const user = userEvent.setup();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /More options/i }));
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Course length' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Focus on' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Learning goal/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Course name'), 'Pharmacology');
    await user.click(screen.getByRole('radio', { name: 'advanced' }));
    await user.click(screen.getByRole('radio', { name: 'In-depth' }));
    await user.click(screen.getByRole('button', { name: 'Case scenarios' }));
    await user.click(screen.getByRole('button', { name: 'Key terms and definitions' }));
    await user.type(screen.getByLabelText(/Learning goal/i), 'Pass the finals');
    await user.click(screen.getByRole('button', { name: 'Generate course' }));

    await waitFor(() => expect(generateCourse).toHaveBeenCalledWith({
      courseName: 'Pharmacology', difficulty: 'advanced', goal: 'Pass the finals',
      purpose: 'from_scratch', length: 'in_depth', focus: ['case_scenarios', 'key_terms'],
    }));
  });

  it('focus pills toggle on and off', async () => {
    const user = userEvent.setup();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /More options/i }));
    const pill = screen.getByRole('button', { name: 'Worked examples' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');

    await user.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');

    await user.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a clear error and stays open when generation fails', async () => {
    const user = userEvent.setup();
    generateCourse.mockRejectedValue(new Error('AILA could not build that roadmap.'));
    const onGenerated = vi.fn();
    render(<AddCourseWizard onClose={vi.fn()} onGenerated={onGenerated} />);

    await user.type(screen.getByLabelText('Course name'), 'Statistics');
    await user.click(screen.getByRole('button', { name: 'Generate course' }));

    await waitFor(() => expect(screen.getByText('AILA could not build that roadmap.')).toBeInTheDocument());
    expect(onGenerated).not.toHaveBeenCalled();
  });
});
