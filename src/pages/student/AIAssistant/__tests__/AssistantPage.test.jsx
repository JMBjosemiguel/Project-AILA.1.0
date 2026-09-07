import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

import AssistantPage from '../index.jsx';
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
  await user.click(screen.getByRole('button', { name: new RegExp(name) }));
}

async function typeAndSend(user, text) {
  const box = screen.getByPlaceholderText(/Ask AILA/i);
  await user.click(box);
  await user.keyboard(text);
  // the send button is the only enabled submit-style button near the input
  const sendBtn = box.closest('div').querySelector('button:last-of-type');
  await user.click(sendBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
  getConversationMessages.mockImplementation((id) => Promise.resolve(historyFor[id]));
});

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
    const chatABtn = screen.getByRole('button', { name: /Chat A/ });
    const item = chatABtn.parentElement;
    const trashIcon = item.querySelector('.lucide-trash-2, .lucide-trash2');
    await user.click(trashIcon.closest('button'));
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
    expect(sendChatMessage).toHaveBeenCalledWith('brand new question', null, null);

    d.resolve({ conversationId: 99, messageType: 'text', response: 'reply to the new chat' });
    await waitFor(() => expect(screen.getByText('reply to the new chat')).toBeInTheDocument());
    expect(thinkingVisible()).toBe(false);
  });
});
