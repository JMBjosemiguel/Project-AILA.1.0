import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubjectCard from '../SubjectCard.jsx';

function makeSubject(overrides = {}) {
  return {
    id: 1, name: 'Pharmacology', code: null, is_ai_generated: true, difficulty: 'intermediate',
    visibility: 'private', copied_from_subject_id: null, progress_percent: 0, modules: [],
    ...overrides,
  };
}

describe('SubjectCard — course purpose badge', () => {
  it('shows a badge for a known purpose', () => {
    render(<SubjectCard subject={makeSubject({ purpose: 'board_exam' })} onSelectLesson={vi.fn()} />);
    expect(screen.getByText('Board exam (NLE) review')).toBeInTheDocument();
  });

  it('shows no badge when the course has no purpose (legacy course)', () => {
    render(<SubjectCard subject={makeSubject({ purpose: null })} onSelectLesson={vi.fn()} />);
    expect(screen.queryByText(/review|scratch|catch up|clinical|mastery/i)).not.toBeInTheDocument();
  });

  it('never crashes on an unrecognized purpose value — just shows no badge', () => {
    render(<SubjectCard subject={makeSubject({ purpose: 'not_a_real_purpose' })} onSelectLesson={vi.fn()} />);
    expect(screen.getByText('Pharmacology')).toBeInTheDocument();
  });
});
