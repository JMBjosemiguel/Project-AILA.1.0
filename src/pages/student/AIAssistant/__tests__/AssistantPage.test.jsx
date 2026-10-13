import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---- mocks ---------------------------------------------------------------
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'Sam' } }),
}));

const conversations = [
  { id: 1, title: 'Chat A', started_at: '2026-01-01T00:00:00Z' },
  { id: 2, title: 'Chat B', started_at: '2026-01-02T00:00:00Z' },
];
vi.mock('../../../../hooks/useChatbotData', () => ({
  useChatbotData: () => ({ data: { conversations, suggestedQuestions: [], categories: [] }, loading: false, error: null }),
}));

vi.mock('../../../../services/api/chatService', () => ({
  sendChatMessage: vi.fn(),
  getConversationMessages: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  regenerateLastResponse: vi.fn(),
}));

const saveChatQuizAsQuiz = vi.fn();
const getChatQuizzes = vi.fn();
vi.mock('../../../../services/api/quizService', () => ({
  saveChatQuizAsQuiz: (...args) => saveChatQuizAsQuiz(...args),
  getChatQuizzes: (...args) => getChatQuizzes(...args),
}));
vi.mock('../../../../components/student/quiz/QuizRunner', () => ({
  default: ({ resumeQuizId, onClose }) => (
    <div data-testid="quiz-runner">
      <span>QuizRunner for {resumeQuizId}</span>
      <button onClick={onClose}>Close runner</button>
    </div>
  ),
}));
const setResourceSearchTarget = vi.fn();
vi.mock('../../../../utils/resourceSearchTarget', () => ({ setResourceSearchTarget: (term) => setResourceSearchTarget(term) }));
const uploadResource = vi.fn();
const getResourceLibraryData = vi.fn();
vi.mock('../../../../services/api/resourceService', () => ({
  uploadResource: (...args) => uploadResource(...args),
  getResourceLibraryData: (...args) => getResourceLibraryData(...args),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('../../../../components/common/Toast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

import AssistantPage from '../index.jsx';
import { _resetChatbotQuizState } from '../../../../utils/chatbotQuizState';
import {
  sendChatMessage,
  getConversationMessages,
  deleteConversation,
  regenerateLastResponse,
} from '../../../../services/api/chatService';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const historyFor = {
  1: { messages: [
    { sender: 'user', text: 'hi from A', type: 'text', data: null },
    { sender: 'bot', text: 'A history reply', type: 'text', data: null },
  ] },
  2: { messages: [
    { sender: 'user', text: 'hi from B', type: 'text', data: null },
    { sender: 'bot', text: 'B history reply', type: 'text', data: null },
  ] },
};

function thinkingVisible() {
  return screen.queryByText(/AILA is thinking/i) !== null;
}

async function openChat(user, name) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}$`) }));
}

async function typeAndSend(user, text) {
  const box = screen.getByPlaceholderText(/Ask AILA/i);
  await user.click(box);
  await user.keyboard(text);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetChatbotQuizState();
  getConversationMessages.mockImplementation((id) => Promise.resolve(historyFor[id]));
  getResourceLibraryData.mockResolvedValue({ resources: [] });
  getChatQuizzes.mockResolvedValue({ quizzes: [] });
});

function makeFile(name, type, size = 1024) {
  const file = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function selectFile(user, file) {
  const input = document.querySelector('input[type="file"]');
  await user.upload(input, file);
}

// user-event's upload() enforces the input's own `accept` filter (mimicking
// the native file picker), so an unsupported type never reaches onChange
// that way — fireEvent bypasses it, exercising the component's own
// server-mimicking fallback validation for a file that slipped through.
function selectFileRaw(file) {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AssistantPage — conversation-scoped thinking / message state', () => {
  it('Scenario A: sending in a chat shows the thinking indicator in that chat', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);

    render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText('A history reply')).toBeInTheDocument());

    await typeAndSend(user, 'a question in A');
    expect(thinkingVisible()).toBe(true);

    d.resolve({ conversationId: 1, messageType: 'text', response: 'answer for A' });
    await waitFor(() => expect(thinkingVisible()).toBe(false));
    expect(screen.getByText('answer for A')).toBeInTheDocument();
  });

  it('Scenario B/D: switching to another chat hides the indicator and the reply never lands there', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);

    render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));
    await typeAndSend(user, 'a question in A');
    expect(thinkingVisible()).toBe(true);

    await openChat(user, 'Chat B');
    await waitFor(() => expect(screen.getByText('B history reply')).toBeInTheDocument());
    expect(thinkingVisible()).toBe(false);

    // Chat A's request resolves while we're looking at Chat B.
    d.resolve({ conversationId: 1, messageType: 'text', response: 'answer for A' });
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalled());

    // Chat B is untouched: still selected, still its own messages, no A reply, no indicator.
    expect(screen.getByText('B history reply')).toBeInTheDocument();
    expect(screen.queryByText('answer for A')).not.toBeInTheDocument();
    expect(thinkingVisible()).toBe(false);

    // Returning to Chat A shows the reply (re-fetched from history).
    getConversationMessages.mockResolvedValueOnce({
      messages: [...historyFor[1].messages, { sender: 'bot', text: 'answer for A', type: 'text', data: null }],
    });
    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText('answer for A')).toBeInTheDocument());
  });

  it('Scenario C: returning to the pending chat still shows its own indicator', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);

    render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));
    await typeAndSend(user, 'pending question');
    expect(thinkingVisible()).toBe(true);

    await openChat(user, 'Chat B');
    expect(thinkingVisible()).toBe(false);

    await openChat(user, 'Chat A');
    await waitFor(() => expect(thinkingVisible()).toBe(true));

    d.resolve({ conversationId: 1, messageType: 'text', response: 'late answer for A' });
    await waitFor(() => expect(screen.getByText('late answer for A')).toBeInTheDocument());
  });

  it('Scenario H: a rejected request clears only its own pending indicator and shows an error', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);

    render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));
    await typeAndSend(user, 'will fail');
    expect(thinkingVisible()).toBe(true);

    d.reject(Object.assign(new Error('AILA could not respond. Please try again.'), { status: 500 }));
    await waitFor(() => expect(thinkingVisible()).toBe(false));
    expect(screen.getByText(/could not respond/i)).toBeInTheDocument();
    // input is usable again
    expect(screen.getByPlaceholderText(/Ask AILA/i)).not.toBeDisabled();
  });

  it('Scenario G: deleting a chat mid-generation drops the reply — no repopulation, no view switch', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);
    deleteConversation.mockResolvedValue({});

    const { container } = render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));
    await typeAndSend(user, 'question then delete');
    expect(thinkingVisible()).toBe(true);

    // delete Chat A from the sidebar
    await user.click(screen.getByRole('button', { name: /Delete conversation: Chat A/ }));
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith(1));
    // deleting the active chat clears the view
    expect(thinkingVisible()).toBe(false);

    d.resolve({ conversationId: 1, messageType: 'text', response: 'orphan answer' });
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalled());

    expect(screen.queryByText('orphan answer')).not.toBeInTheDocument();
    expect(screen.queryByText('B history reply')).not.toBeInTheDocument();
    expect(thinkingVisible()).toBe(false);
    // no unexpected navigation: still a fresh/new chat view (suggested prompts / empty)
    expect(container.textContent).not.toContain('A history reply');
  });

  it('Scenario F: regenerate then switch away — the regenerated reply does not contaminate the other chat', async () => {
    const user = userEvent.setup();
    const d = deferred();
    regenerateLastResponse.mockReturnValue(d.promise);

    render(<AssistantPage />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));

    // regenerate the last bot message (hover reveals the button; jsdom exposes it)
    const regenBtn = screen.getByTitle(/Regenerate response/i);
    await user.click(regenBtn);
    expect(thinkingVisible()).toBe(true);

    await openChat(user, 'Chat B');
    await waitFor(() => expect(screen.getByText('B history reply')).toBeInTheDocument());
    expect(thinkingVisible()).toBe(false);

    d.resolve({ messageType: 'text', response: 'regenerated A reply' });
    await waitFor(() => expect(regenerateLastResponse).toHaveBeenCalledWith(1));

    expect(screen.queryByText('regenerated A reply')).not.toBeInTheDocument();
    expect(screen.getByText('B history reply')).toBeInTheDocument();
  });

  it('Scenario E: a new-chat request adopts the resulting conversation id and its reply', async () => {
    const user = userEvent.setup();
    const d = deferred();
    sendChatMessage.mockReturnValue(d.promise);

    render(<AssistantPage />);
    // start on the fresh "new chat" view (no conversation selected)
    await typeAndSend(user, 'brand new question');
    expect(thinkingVisible()).toBe(true);
    expect(sendChatMessage).toHaveBeenCalledWith('brand new question', null, undefined, { clearResource: false });

    d.resolve({ conversationId: 99, messageType: 'text', response: 'reply to the new chat' });
    await waitFor(() => expect(screen.getByText('reply to the new chat')).toBeInTheDocument());
    expect(thinkingVisible()).toBe(false);
  });
});

describe('AssistantPage — chatbot mini-quiz state', () => {
  const quizData = {
    topic: 'Geography', quizType: 'multiple_choice',
    items: [
      { question: 'Capital of France?', options: ['Paris', 'Berlin'], correctAnswer: 'Paris', explanation: 'Since 987.' },
    ],
  };

  beforeEach(() => {
    historyFor[1] = { messages: [
      { id: 100, sender: 'user', text: 'quiz me', type: 'text', data: null },
      { id: 101, sender: 'bot', text: null, type: 'quiz', data: quizData },
    ] };
    historyFor[2] = { messages: [
      { id: 200, sender: 'user', text: 'hi from B', type: 'text', data: null },
      { id: 201, sender: 'bot', text: 'B history reply', type: 'text', data: null },
    ] };
  });

  it('preserves a selected answer and the submitted review across a conversation switch', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText(/Capital of France\?/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored 1 \/ 1/)).toBeInTheDocument());

    await openChat(user, 'Chat B');
    await waitFor(() => expect(screen.getByText('B history reply')).toBeInTheDocument());
    expect(screen.queryByText(/You scored/)).not.toBeInTheDocument();

    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText(/Capital of France\?/)).toBeInTheDocument());
    expect(screen.getByText(/You scored 1 \/ 1/)).toBeInTheDocument();
    expect(screen.getByText(/Since 987/)).toBeInTheDocument();
  });

  it('a quiz in another conversation has independent state', async () => {
    const user = userEvent.setup();
    historyFor[2] = { messages: [
      { id: 202, sender: 'bot', text: null, type: 'quiz', data: { ...quizData, topic: 'Chemistry' } },
    ] };

    render(<AssistantPage onNavigate={vi.fn()} />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText(/Capital of France\?/));
    await user.click(screen.getByRole('button', { name: 'Paris' }));
    await user.click(screen.getByRole('button', { name: /Check Answers/i }));
    await waitFor(() => expect(screen.getByText(/You scored/)).toBeInTheDocument());

    await openChat(user, 'Chat B');
    await waitFor(() => expect(screen.getByText(/Quiz: Chemistry/)).toBeInTheDocument());
    expect(screen.queryByText(/You scored/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check Answers/i })).toBeInTheDocument();
  });

  it('"Save as Quiz" saves the quiz and opens it right there, without navigating to the Learning Hub', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    saveChatQuizAsQuiz.mockResolvedValue({ quizId: 555, alreadySaved: false });

    render(<AssistantPage onNavigate={onNavigate} />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText(/Capital of France\?/));

    await user.click(screen.getByRole('button', { name: /Save as Quiz/i }));
    await waitFor(() => expect(saveChatQuizAsQuiz).toHaveBeenCalledWith(101));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('AI chat quizzes'));
    expect(onNavigate).not.toHaveBeenCalledWith('hub');
    await waitFor(() => expect(screen.getByTestId('quiz-runner')).toHaveTextContent('555'));
  });

  it('"Save as Quiz" saved twice still opens the same existing quiz (idempotent)', async () => {
    const user = userEvent.setup();
    saveChatQuizAsQuiz.mockResolvedValue({ quizId: 555, alreadySaved: true });

    render(<AssistantPage onNavigate={vi.fn()} />);
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText(/Capital of France\?/));

    await user.click(screen.getByRole('button', { name: /Save as Quiz/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('Already in your AI chat quizzes')));
    await waitFor(() => expect(screen.getByTestId('quiz-runner')).toHaveTextContent('555'));
  });
});

describe('AssistantPage — Saved quizzes tab', () => {
  it('renders the saved chat quizzes and opens the runner on Take', async () => {
    const user = userEvent.setup();
    getChatQuizzes.mockResolvedValue({
      quizzes: [
        { id: 42, topic: 'Subnetting basics', quizType: 'multiple_choice', itemCount: 5, createdAt: '2026-01-01T00:00:00Z', lastPercent: 80, bestPercent: 80, inProgress: false },
      ],
    });

    render(<AssistantPage onNavigate={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: /Saved quizzes/i }));

    await waitFor(() => expect(screen.getByText('Subnetting basics')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Retake/i }));
    await waitFor(() => expect(screen.getByTestId('quiz-runner')).toHaveTextContent('42'));
  });

  it('shows an empty state when there are no saved quizzes yet', async () => {
    const user = userEvent.setup();
    getChatQuizzes.mockResolvedValue({ quizzes: [] });

    render(<AssistantPage onNavigate={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: /Saved quizzes/i }));

    await waitFor(() => expect(screen.getByText(/No saved quizzes yet/i)).toBeInTheDocument());
  });
});

describe('AssistantPage — mobile conversation-list drawer', () => {
  // Earlier tests in this file permanently overwrite the shared `historyFor`
  // fixture (e.g. line 261) without restoring it — reset Chat A/B back to
  // known plain-text content here so these tests don't depend on file order.
  beforeEach(() => {
    historyFor[1] = { messages: [
      { sender: 'user', text: 'hi from A', type: 'text', data: null },
      { sender: 'bot', text: 'A history reply', type: 'text', data: null },
    ] };
    historyFor[2] = { messages: [
      { sender: 'user', text: 'hi from B', type: 'text', data: null },
      { sender: 'bot', text: 'B history reply', type: 'text', data: null },
    ] };
  });

  it('opens via the header hamburger button and closes via the sidebar close button', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    const menuButton = screen.getByRole('button', { name: /open conversation list/i });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: /close conversation list/i }));
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a conversation is selected', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /open conversation list/i }));
    await openChat(user, 'Chat A');
    await waitFor(() => screen.getByText('A history reply'));

    expect(screen.getByRole('button', { name: /open conversation list/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when "New chat" is pressed', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /open conversation list/i }));
    await user.click(screen.getByRole('button', { name: /New chat/i }));

    expect(screen.getByRole('button', { name: /open conversation list/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('locks background scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    expect(document.body.style.overflow).not.toBe('hidden');
    await user.click(screen.getByRole('button', { name: /open conversation list/i }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: /close conversation list/i }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('AssistantPage — chat attachments', () => {
  it('the paperclip opens a menu with both attach options', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach a file/i }));
    expect(screen.getByRole('menuitem', { name: /Upload a file/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Choose from Resource Library/i })).toBeInTheDocument();
  });

  it('uploading a file shows a progress chip, then the attached title', async () => {
    const user = userEvent.setup();
    let resolveUpload;
    let progressCb;
    uploadResource.mockImplementation((file, subjectId, { onUploadProgress } = {}) => {
      progressCb = onUploadProgress;
      return new Promise((resolve) => { resolveUpload = resolve; });
    });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    expect(screen.getByText(/Uploading "notes.pdf"/)).toBeInTheDocument();

    progressCb(42);
    await waitFor(() => expect(screen.getByText(/42%/)).toBeInTheDocument());

    resolveUpload({ id: 9, title: 'My Notes' });
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());
    expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument();
  });

  it('rejects an unsupported file type client-side, without calling the upload endpoint', async () => {
    render(<AssistantPage onNavigate={vi.fn()} />);

    selectFileRaw(makeFile('archive.zip', 'application/zip'));
    await waitFor(() => expect(screen.getByText(/not supported/i)).toBeInTheDocument());
    expect(uploadResource).not.toHaveBeenCalled();
  });

  it('rejects a file over 200MB client-side, without calling the upload endpoint', async () => {
    const user = userEvent.setup();
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('huge.pdf', 'application/pdf', 200 * 1024 * 1024 + 1));
    expect(screen.getByText(/too large/i)).toBeInTheDocument();
    expect(uploadResource).not.toHaveBeenCalled();
  });

  it('shows a clear error when the upload fails, and keeps what was typed', async () => {
    const user = userEvent.setup();
    uploadResource.mockRejectedValue(new Error('Could not upload that file.'));
    render(<AssistantPage onNavigate={vi.fn()} />);

    const box = screen.getByPlaceholderText(/Ask AILA/i);
    await user.click(box);
    await user.keyboard('please look at this');
    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));

    await waitFor(() => expect(screen.getByText('Could not upload that file.')).toBeInTheDocument());
    expect(box).toHaveValue('please look at this');
  });

  it('the Send button is disabled while an upload is in flight, and re-enabled once it finishes', async () => {
    const user = userEvent.setup();
    let resolveUpload;
    uploadResource.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    render(<AssistantPage onNavigate={vi.fn()} />);

    const box = screen.getByPlaceholderText(/Ask AILA/i);
    await user.click(box);
    await user.keyboard('a question');
    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    resolveUpload({ id: 9, title: 'My Notes' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
  });

  it('removing the attachment clears the chip', async () => {
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Remove attachment' }));
    expect(screen.queryByText('My Notes')).not.toBeInTheDocument();
  });

  it('"Choose from Resource Library" picks a resource and attaches it', async () => {
    const user = userEvent.setup();
    getResourceLibraryData.mockResolvedValue({ resources: [{ id: 5, title: 'Shared Syllabus', type: 'pdf' }] });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach a file/i }));
    await user.click(screen.getByRole('menuitem', { name: /Choose from Resource Library/i }));
    await waitFor(() => expect(screen.getByText('Shared Syllabus')).toBeInTheDocument());
    await user.click(screen.getByText('Shared Syllabus'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(uploadResource).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByText('Shared Syllabus').length).toBeGreaterThan(0));
  });

  it('a sent message carrying an attachment shows a chip that opens the Resource Library', async () => {
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    sendChatMessage.mockResolvedValue({ conversationId: 77, messageType: 'text', response: 'Here is a summary.' });
    const onNavigate = vi.fn();
    render(<AssistantPage onNavigate={onNavigate} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());
    await typeAndSend(user, 'please summarize this');

    expect(sendChatMessage).toHaveBeenCalledWith('please summarize this', null, 9, { clearResource: false });
    await waitFor(() => expect(screen.getByText('Here is a summary.')).toBeInTheDocument());

    const openButton = screen.getByRole('button', { name: /Open in Resource Library/i });
    await user.click(openButton);
    expect(setResourceSearchTarget).toHaveBeenCalledWith('My Notes');
    expect(onNavigate).toHaveBeenCalledWith('resources');
  });

  it('a follow-up message in the same conversation omits resourceId — the backend already has it stored', async () => {
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    sendChatMessage.mockResolvedValue({ conversationId: 77, messageType: 'text', response: 'ok' });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());
    await typeAndSend(user, 'first question');
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('first question', null, 9, { clearResource: false }));

    await typeAndSend(user, 'second question');
    // No change since the first message — resourceId is omitted (undefined),
    // not resent, and the chip is still shown (still attached, just not re-sent).
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('second question', 77, undefined, { clearResource: false }));
    // Still attached (the compose-area chip, not a sent-message chip) — just not re-sent.
    expect(screen.getByRole('button', { name: 'Remove attachment' })).toBeInTheDocument();
  });

  it('removing the attachment sends an explicit clear on the next message, then stops being sent again', async () => {
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    sendChatMessage.mockResolvedValue({ conversationId: 77, messageType: 'text', response: 'ok' });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());
    await typeAndSend(user, 'first question');
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('first question', null, 9, { clearResource: false }));

    await user.click(screen.getByRole('button', { name: 'Remove attachment' }));
    // The compose-area chip is gone (the sent message's own chip, from the
    // first question, legitimately still shows "My Notes" in history).
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).not.toBeInTheDocument();

    await typeAndSend(user, 'forget the file');
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('forget the file', 77, undefined, { clearResource: true }));

    await typeAndSend(user, 'one more thing');
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('one more thing', 77, undefined, { clearResource: false }));
  });

  it('removing an attachment before ever sending it still reports a (harmless) explicit clear on the next message', async () => {
    // The backend never had this attachment stored in the first place (the
    // conversation doesn't even exist yet), so an explicit resource_id: null
    // here is a no-op server-side — simpler than tracking "was this specific
    // attachment ever actually sent" just to skip a harmless redundant clear.
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Remove attachment' }));

    sendChatMessage.mockResolvedValue({ conversationId: 77, messageType: 'text', response: 'ok' });
    await typeAndSend(user, 'a plain question');
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('a plain question', null, undefined, { clearResource: true }));
  });

  it('reopening a conversation shows its attached file as a chip', async () => {
    const user = userEvent.setup();
    getConversationMessages.mockImplementation((id) => Promise.resolve(id === 1
      ? { conversation: { id: 1, resource: { id: 3, title: 'Course Syllabus' } }, messages: historyFor[1].messages }
      : historyFor[id]));
    render(<AssistantPage onNavigate={vi.fn()} />);

    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText(/hi from A/)).toBeInTheDocument());
    expect(screen.getByText('Course Syllabus')).toBeInTheDocument();
  });

  it('switching to a conversation with no attachment clears the chip', async () => {
    const user = userEvent.setup();
    uploadResource.mockResolvedValue({ id: 9, title: 'My Notes' });
    render(<AssistantPage onNavigate={vi.fn()} />);

    await selectFile(user, makeFile('notes.pdf', 'application/pdf'));
    await waitFor(() => expect(screen.getByText('My Notes')).toBeInTheDocument());

    await openChat(user, 'Chat A');
    await waitFor(() => expect(screen.getByText(/hi from A/)).toBeInTheDocument());
    expect(screen.queryByText('My Notes')).not.toBeInTheDocument();
  });

  it('attaching a resource the student can no longer access shows a clear error', async () => {
    const user = userEvent.setup();
    getResourceLibraryData.mockResolvedValue({ resources: [{ id: 5, title: 'Old Shared Notes', type: 'pdf' }] });
    sendChatMessage.mockRejectedValue(Object.assign(new Error("That resource could not be found or you don't have access to it."), { status: 404 }));
    render(<AssistantPage onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Attach a file/i }));
    await user.click(screen.getByRole('menuitem', { name: /Choose from Resource Library/i }));
    await waitFor(() => expect(screen.getByText('Old Shared Notes')).toBeInTheDocument());
    await user.click(screen.getByText('Old Shared Notes'));

    await typeAndSend(user, 'summarize this');
    await waitFor(() => expect(screen.getByText(/could not be found or you don.t have access/i)).toBeInTheDocument());
  });
});
