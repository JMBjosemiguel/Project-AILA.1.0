import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api/shareService', () => ({
  viewSharedMaterial: vi.fn(),
  copySharedMaterial: vi.fn(),
}));
vi.mock('../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../components/chatbot/MarkdownRenderer', () => ({ default: ({ text }) => <div>{text}</div> }));

import SharedMaterialPage from '../index.jsx';
import { viewSharedMaterial, copySharedMaterial } from '../../../services/api/shareService';

const COURSE = {
  shareType: 'subject', title: 'Data Structures', difficulty: 'intermediate', goal: 'pass', sharedBy: 'Ada L.',
  moduleCount: 1, lessonCount: 1, hasAssessments: true,
  modules: [{ title: 'Linked Lists', topics: [{ title: 'Nodes', lessons: [{ title: 'What is a node', content: 'A node has data and a pointer.' }], keyTerms: [{ term: 'Node', definition: 'a unit' }], examples: [] }] }],
};
const QUIZ = {
  shareType: 'quiz', topic: 'Recursion', difficulty: 'medium', sharedBy: 'Ada L.', questionCount: 1,
  items: [{ question: 'What is a base case?', options: ['stops recursion', 'speeds it up'] }],
};

beforeEach(() => vi.clearAllMocks());

describe('SharedMaterialPage', () => {
  it('renders a shared course read-only, with no answer key or owner data', async () => {
    viewSharedMaterial.mockResolvedValue(COURSE);
    render(<SharedMaterialPage token="tok" isAuthenticated={false} onNavigate={vi.fn()} onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Data Structures')).toBeInTheDocument());
    expect(screen.getByText(/A node has data and a pointer/)).toBeInTheDocument();
    expect(screen.getByText(/Shared by Ada L\./)).toBeInTheDocument();
    expect(screen.queryByText(/correctAnswer|personalization|xp_points/i)).not.toBeInTheDocument();
  });

  it('renders a shared quiz with questions and options but never an answer key', async () => {
    viewSharedMaterial.mockResolvedValue(QUIZ);
    render(<SharedMaterialPage token="tok" isAuthenticated={false} onNavigate={vi.fn()} onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/What is a base case/)).toBeInTheDocument());
    expect(screen.getByText('stops recursion')).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer|explanation|isCorrect/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check Answers/i })).not.toBeInTheDocument();
  });

  it('a logged-out visitor sees "Log in to copy"', async () => {
    const onGoToLogin = vi.fn();
    const user = userEvent.setup();
    viewSharedMaterial.mockResolvedValue(QUIZ);
    render(<SharedMaterialPage token="tok" isAuthenticated={false} onNavigate={vi.fn()} onGoToLogin={onGoToLogin} />);

    await waitFor(() => screen.getByText(/What is a base case/));
    await user.click(screen.getByRole('button', { name: /Log in to copy/i }));
    expect(onGoToLogin).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Copy to my materials/i })).not.toBeInTheDocument();
  });

  it('a logged-in visitor can copy the material and is navigated onward', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    viewSharedMaterial.mockResolvedValue(COURSE);
    copySharedMaterial.mockResolvedValue({ materialType: 'subject', materialId: 42, name: 'Data Structures' });
    render(<SharedMaterialPage token="tok" isAuthenticated onNavigate={onNavigate} onGoToLogin={vi.fn()} />);

    await waitFor(() => screen.getByText('Data Structures'));
    await user.click(screen.getByRole('button', { name: /Copy to my materials/i }));
    await waitFor(() => expect(copySharedMaterial).toHaveBeenCalledWith('tok'));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('an invalid / revoked token shows the unavailable state', async () => {
    viewSharedMaterial.mockRejectedValue(Object.assign(new Error('This shared material is no longer available.'), { status: 404 }));
    render(<SharedMaterialPage token="gone" isAuthenticated={false} onNavigate={vi.fn()} onGoToLogin={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Copy|Log in/i })).not.toBeInTheDocument();
  });
});
