import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api/shareService', () => ({
  viewSharedMaterial: vi.fn(),
  copySharedMaterial: vi.fn(),
  checkSharedQuizAnswers: vi.fn(),
}));
vi.mock('../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../components/chatbot/MarkdownRenderer', () => ({ default: ({ text }) => <div>{text}</div> }));

import SharedMaterialPage from '../index.jsx';
import { ConfirmProvider } from '../../../components/common/ConfirmDialog';
import { viewSharedMaterial, copySharedMaterial, checkSharedQuizAnswers } from '../../../services/api/shareService';

function renderShared(props) {
  return render(
    <ConfirmProvider>
      <SharedMaterialPage onNavigate={vi.fn()} onGoToLogin={vi.fn()} {...props} />
    </ConfirmProvider>
  );
}

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
    renderShared({ token: 'tok', isAuthenticated: false });

    await waitFor(() => expect(screen.getByText('Data Structures')).toBeInTheDocument());
    expect(screen.getByText(/A node has data and a pointer/)).toBeInTheDocument();
    expect(screen.getByText(/Shared by Ada L\. · read-only/)).toBeInTheDocument();
    expect(screen.queryByText(/correctAnswer|personalization|xp_points/i)).not.toBeInTheDocument();
  });

  // Previously this asserted there was NO "Check Answers" button at all — that
  // described the old read-only-only behavior. Anyone with the link can now
  // answer and self-check a shared quiz (see shareCheckAnswers), so the
  // button is now expected; the answer key is still never sent in the GET
  // view itself, only revealed in the check response after submitting.
  it('renders a shared quiz with questions and options, a "practice quiz" label, a practice-only note, and a Check Answers button — but no answer key before checking', async () => {
    viewSharedMaterial.mockResolvedValue(QUIZ);
    renderShared({ token: 'tok', isAuthenticated: false });

    await waitFor(() => expect(screen.getByText(/What is a base case/)).toBeInTheDocument());
    expect(screen.getByText('stops recursion')).toBeInTheDocument();
    expect(screen.getByText(/Shared by Ada L\. · practice quiz/)).toBeInTheDocument();
    expect(screen.getByText(/practice only/i)).toBeInTheDocument();
    expect(screen.getByText(/answers aren.t saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer|explanation|isCorrect/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check Answers/i })).toBeInTheDocument();
  });

  // A shared quiz is answerable without any account, so copying it into
  // "your materials" (which needs an account either way) is no longer the
  // point of this page for a quiz — the button is now course-only.
  it('a shared quiz has no "Copy to my materials" / "Log in to copy" button at all, logged in or out', async () => {
    viewSharedMaterial.mockResolvedValue(QUIZ);
    const { unmount } = renderShared({ token: 'tok', isAuthenticated: false });
    await waitFor(() => screen.getByText(/What is a base case/));
    expect(screen.queryByRole('button', { name: /Log in to copy|Copy to my materials/i })).not.toBeInTheDocument();
    unmount();

    renderShared({ token: 'tok', isAuthenticated: true });
    await waitFor(() => screen.getByText(/What is a base case/));
    expect(screen.queryByRole('button', { name: /Log in to copy|Copy to my materials/i })).not.toBeInTheDocument();
  });

  it('a logged-out visitor on a shared COURSE sees "Log in to copy"', async () => {
    const onGoToLogin = vi.fn();
    const user = userEvent.setup();
    viewSharedMaterial.mockResolvedValue(COURSE);
    renderShared({ token: 'tok', isAuthenticated: false, onGoToLogin });

    await waitFor(() => screen.getByText('Data Structures'));
    await user.click(screen.getByRole('button', { name: /Log in to copy/i }));
    expect(onGoToLogin).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Copy to my materials/i })).not.toBeInTheDocument();
  });

  it('a logged-in visitor can copy the material and is navigated onward', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    viewSharedMaterial.mockResolvedValue(COURSE);
    copySharedMaterial.mockResolvedValue({ materialType: 'subject', materialId: 42, name: 'Data Structures' });
    renderShared({ token: 'tok', isAuthenticated: true, onNavigate });

    await waitFor(() => screen.getByText('Data Structures'));
    await user.click(screen.getByRole('button', { name: /Copy to my materials/i }));
    await waitFor(() => expect(copySharedMaterial).toHaveBeenCalledWith('tok'));
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('an invalid / revoked token shows the unavailable state', async () => {
    viewSharedMaterial.mockRejectedValue(Object.assign(new Error('This shared material is no longer available.'), { status: 404 }));
    renderShared({ token: 'gone', isAuthenticated: false });

    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Copy|Log in/i })).not.toBeInTheDocument();
  });

  describe('answering a shared quiz', () => {
    const CHECK_RESULT = {
      score: 1, total: 1, percent: 100,
      results: [{ index: 0, isCorrect: true, yourAnswer: 'stops recursion', correctAnswer: 'stops recursion', explanation: 'A base case ends the recursion.' }],
    };

    it('answering and checking shows the score, per-item correctness, and the explanation', async () => {
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      checkSharedQuizAnswers.mockResolvedValue(CHECK_RESULT);
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));
      await user.click(screen.getByRole('button', { name: /Check Answers/i }));

      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
      expect(checkSharedQuizAnswers).toHaveBeenCalledWith('tok', [{ index: 0, answer: 'stops recursion' }]);
      expect(screen.getByText('100% correct')).toBeInTheDocument();
      expect(screen.getByText(/A base case ends the recursion/)).toBeInTheDocument();
    });

    it('this works for a logged-out visitor exactly the same way', async () => {
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      checkSharedQuizAnswers.mockResolvedValue(CHECK_RESULT);
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));
      await user.click(screen.getByRole('button', { name: /Check Answers/i }));

      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
    });

    it('a failed check shows ONE inline error message (not a toast) and never stacks on a second failed click', async () => {
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      checkSharedQuizAnswers.mockRejectedValue(new Error('Route not found: POST /api/share/tok/check'));
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));

      await user.click(screen.getByRole('button', { name: /Check Answers/i }));
      await waitFor(() => expect(screen.getByText(/Route not found/)).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Check Answers/i }));
      await waitFor(() => expect(checkSharedQuizAnswers).toHaveBeenCalledTimes(2));
      expect(screen.getAllByText(/Route not found/)).toHaveLength(1);
      // Still on the answering screen (never "succeeded" into a result) and
      // the button is usable again — not stuck disabled from the failure.
      expect(screen.getByRole('button', { name: /Check Answers/i })).not.toBeDisabled();
    });

    it('the Check Answers button is disabled while a check request is in flight', async () => {
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      let resolveCheck;
      checkSharedQuizAnswers.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));
      await user.click(screen.getByRole('button', { name: /Check Answers/i }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Checking/i })).toBeDisabled());
      resolveCheck(CHECK_RESULT);
      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
    });

    it('"Try Again" clears the result and answers locally, with no new API call', async () => {
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      checkSharedQuizAnswers.mockResolvedValue(CHECK_RESULT);
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));
      await user.click(screen.getByRole('button', { name: /Check Answers/i }));
      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Try Again/i }));

      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Check Answers/i })).toBeInTheDocument();
      expect(checkSharedQuizAnswers).toHaveBeenCalledTimes(1);
    });

    it('never writes anything to localStorage during view, answer, check, or Try Again', async () => {
      const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem');
      const user = userEvent.setup();
      viewSharedMaterial.mockResolvedValue(QUIZ);
      checkSharedQuizAnswers.mockResolvedValue(CHECK_RESULT);
      renderShared({ token: 'tok', isAuthenticated: false });

      await waitFor(() => screen.getByText(/What is a base case/));
      await user.click(screen.getByRole('button', { name: 'stops recursion' }));
      await user.click(screen.getByRole('button', { name: /Check Answers/i }));
      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Try Again/i }));

      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    });
  });
});
