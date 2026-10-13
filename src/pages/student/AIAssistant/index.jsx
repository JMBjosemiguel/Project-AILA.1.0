import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import ChatInput from '../../../components/chatbot/ChatInput';
import ChatSidebar from '../../../components/chatbot/ChatSidebar';
import AttachResourceDialog from '../../../components/chatbot/AttachResourceDialog';
import MessageBubble, { TypingBubble } from '../../../components/chatbot/MessageBubble';
import SuggestedPrompts from '../../../components/chatbot/SuggestedPrompts';
import QuizRunner from '../../../components/student/quiz/QuizRunner';
import AilaOrb from '../../../components/common/AilaOrb';
import { useToast } from '../../../components/common/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { useChatbotData } from '../../../hooks/useChatbotData';
import { useSavedChatQuizzes } from '../../../hooks/useSavedChatQuizzes';
import { ACCEPTED_RESOURCE_FILE_TYPES, MAX_RESOURCE_FILE_SIZE_BYTES } from '../../../constants/ui';
import { consumePrefillPrompt } from '../../../utils/aiPrefill';
import { setResourceSearchTarget } from '../../../utils/resourceSearchTarget';
import { readChatbotQuizState, writeChatbotQuizState } from '../../../utils/chatbotQuizState';
import {
  sendChatMessage,
  getConversationMessages,
  renameConversation,
  deleteConversation,
  regenerateLastResponse,
} from '../../../services/api/chatService';
import { saveChatQuizAsQuiz } from '../../../services/api/quizService';
import { uploadResource } from '../../../services/api/resourceService';

// Sentinel for an AI request that started on a brand-new chat (no server id yet).
const NEW_CHAT = Symbol('new-chat');

function conversationKey(activeChat) {
  return activeChat ?? NEW_CHAT;
}

// Stable per-render-session client id for optimistic messages that don't have a
// chat_messages row id yet. Keeps React keys — and chatbot quiz UI state — stable.
let clientMessageSeq = 0;
function nextClientId() {
  clientMessageSeq += 1;
  return clientMessageSeq;
}

// A message's stable React key: the DB row id once we have one, else a client id.
function messageKey(message) {
  return message.id != null ? `m${message.id}` : `c${message.clientId}`;
}

function mapHistoryMessages(messages) {
  return messages.map((message) => ({
    id: message.id ?? null,
    clientId: message.id == null ? nextClientId() : null,
    role: message.sender,
    text: message.text,
    type: message.type,
    data: message.data,
  }));
}

export default function AssistantPage({ onNavigate }) {
  const { user } = useAuth();
  const [historyVersion, setHistoryVersion] = useState(0);
  const { data } = useChatbotData(historyVersion);
  const [savedQuizzesVersion, setSavedQuizzesVersion] = useState(0);
  const { data: savedQuizzesData, loading: savedQuizzesLoading } = useSavedChatQuizzes(savedQuizzesVersion);
  // The quiz currently open inside the AI Assistant (its own QuizRunner
  // overlay) — opened either by "Save as Quiz" or by taking/resuming one
  // from the Saved quizzes tab. Never navigates to the Learning Hub.
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  // Which conversation currently owns an in-flight AI request (id, NEW_CHAT, or null).
  const [pendingChat, setPendingChat] = useState(null);
  const [error, setError] = useState('');
  const [activeChat, setActiveChat] = useState(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  // Per-message "Save as Quiz" status, keyed by messageKey(message).
  const [saveQuizStates, setSaveQuizStates] = useState({});
  // The resource currently attached to the compose box. Reflects the
  // conversation's actual stored attachment (chat_conversations.resource_id)
  // — hydrated from the server on reopen (handleSelectChat), and updated
  // optimistically on attach/detach. The chip itself doesn't need frontend
  // session tricks anymore: it's just a view of real, persisted state.
  const [attachedResource, setAttachedResource] = useState(null); // { id, title }
  const [attachUpload, setAttachUpload] = useState(null); // { fileName, progress }
  const [attachError, setAttachError] = useState('');
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const toast = useToast();
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);
  const pendingResourceIdRef = useRef(null);
  // True once the attachment has changed (attached/switched/detached) since
  // the last message — the NEXT send reports exactly that one change to the
  // backend (a specific resourceId, or an explicit clear); every other send
  // omits resource_id entirely so the backend's own stored value keeps
  // grounding follow-ups without this needing to resend anything.
  const pendingAttachChangeRef = useRef(false);
  const activeChatRef = useRef(null);
  const pendingChatRef = useRef(null);
  const deletedChatsRef = useRef(new Set());
  const uploadTokenRef = useRef(0);
  const avatarLetter = user?.first_name?.[0] ?? 'A';

  // Full reset for switching context entirely (new chat / a different past
  // conversation) — nothing pending to report, since we're not acting on
  // whatever conversation we're leaving. `next` seeds the conversation we're
  // moving TO, if it already has a known attachment (e.g. from history).
  const resetAttachmentState = (next = null) => {
    uploadTokenRef.current += 1; // invalidates any upload still in flight
    pendingAttachChangeRef.current = false;
    setAttachUpload(null);
    setAttachedResource(next);
    setAttachError('');
  };

  // The chip's own remove (x) — detaches from the ACTIVE conversation. Marks
  // a pending change only if there was actually something attached, so the
  // next message sends an explicit resourceId: null (never a no-op clear).
  const handleRemoveAttachment = () => {
    if (attachedResource) pendingAttachChangeRef.current = true;
    uploadTokenRef.current += 1;
    setAttachUpload(null);
    setAttachedResource(null);
    setAttachError('');
  };

  const currentKey = conversationKey(activeChat);
  const showTyping = pendingChat !== null && pendingChat === currentKey;
  const isBusy = pendingChat !== null;

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, showTyping]);

  useEffect(() => {
    const prefill = consumePrefillPrompt();
    if (prefill) {
      setMessages([]);
      setActiveChat(null);
      pendingResourceIdRef.current = prefill.resourceId || null;
      if (prefill.resourceId) {
        send(prefill.text);
      } else {
        setInput(prefill.text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPending = (key) => {
    pendingChatRef.current = key;
    setPendingChat(key);
  };

  const clearPending = (key) => {
    if (pendingChatRef.current === key) {
      pendingChatRef.current = null;
      setPendingChat(null);
    }
  };

  // Re-evaluated against the LIVE selection after an await, so a request that
  // finishes while the user is looking at another conversation stays out of view.
  const isStillOnRequestChat = (reqChat) => (
    reqChat === NEW_CHAT
      ? activeChatRef.current === null
      : activeChatRef.current === reqChat
  );

  const send = async (text) => {
    if (sendingRef.current) return;

    const value = (text ?? input).trim();
    if (!value) {
      setError('Please enter a message for AILA.');
      return;
    }

    const reqChat = conversationKey(activeChat);
    sendingRef.current = true;
    setError('');
    const attachmentForMessage = attachedResource ? { id: attachedResource.id, title: attachedResource.title } : null;
    setMessages((current) => [...current, {
      id: null, clientId: nextClientId(), role: 'user', text: value, type: 'text', data: null, attachment: attachmentForMessage,
    }]);
    setInput('');
    startPending(reqChat);

    // A fresh "Ask AILA" handoff from the Resource Library (one-shot) takes
    // priority; otherwise report the attachment ONLY if it just changed —
    // omitted entirely otherwise, so the backend's own stored value keeps
    // grounding follow-ups without this needing to resend anything.
    let resourceId = pendingResourceIdRef.current ?? undefined;
    let clearResource = false;
    if (resourceId === undefined && pendingAttachChangeRef.current) {
      if (attachedResource) {
        resourceId = attachedResource.id;
      } else {
        clearResource = true;
      }
    }
    pendingResourceIdRef.current = null;
    pendingAttachChangeRef.current = false;

    try {
      const result = await sendChatMessage(value, activeChat, resourceId, { clearResource });
      const resolvedId = result.conversationId ?? null;

      if (deletedChatsRef.current.has(reqChat) || (resolvedId && deletedChatsRef.current.has(resolvedId))) {
        return; // conversation was deleted while we waited — drop the reply from the UI
      }

      if (isStillOnRequestChat(reqChat)) {
        setMessages((current) => [
          ...current,
          { id: result.messageId ?? null, clientId: nextClientId(), role: 'bot', text: result.response, type: result.messageType, data: result.data },
        ]);
        if (resolvedId && activeChatRef.current !== resolvedId) {
          setActiveChat(resolvedId);
        }
      }

      // Refresh the sidebar (new conversation / updated preview) whether or not
      // the reply landed in the current view.
      setHistoryVersion((version) => version + 1);
    } catch (chatError) {
      if (isStillOnRequestChat(reqChat)) {
        if (chatError.status === 404) {
          setActiveChat(null);
        }
        setError(chatError.message || 'AILA could not respond. Please try again.');
      }
    } finally {
      clearPending(reqChat);
      sendingRef.current = false;
    }
  };

  const handleNewChat = () => {
    setError('');
    setMessages([]);
    setActiveChat(null);
    pendingResourceIdRef.current = null;
    resetAttachmentState();
    setChatSidebarOpen(false);
  };

  const handleFileSelected = async (file) => {
    setAttachError('');
    if (!ACCEPTED_RESOURCE_FILE_TYPES.includes(file.type)) {
      setAttachError('That file type is not supported. Try a PDF, Word, PowerPoint, or image file.');
      return;
    }
    if (file.size > MAX_RESOURCE_FILE_SIZE_BYTES) {
      setAttachError('That file is too large. The maximum size is 200 MB.');
      return;
    }

    const token = (uploadTokenRef.current += 1);
    setAttachedResource(null);
    setAttachUpload({ fileName: file.name, progress: 0 });
    try {
      const resource = await uploadResource(file, null, {
        onUploadProgress: (progress) => {
          if (uploadTokenRef.current === token) setAttachUpload((current) => (current ? { ...current, progress } : current));
        },
      });
      if (uploadTokenRef.current !== token) return; // removed while the upload was in flight
      setAttachUpload(null);
      setAttachedResource({ id: resource.id, title: resource.title });
      pendingAttachChangeRef.current = true;
    } catch (uploadError) {
      if (uploadTokenRef.current !== token) return;
      setAttachUpload(null);
      setAttachError(uploadError.message || 'Could not upload that file.');
    }
  };

  const handlePickFromLibrary = (resource) => {
    setShowAttachPicker(false);
    setAttachError('');
    uploadTokenRef.current += 1; // invalidates any upload still in flight
    setAttachUpload(null);
    setAttachedResource(resource);
    pendingAttachChangeRef.current = true;
  };

  const handleOpenAttachment = (attachment) => {
    setResourceSearchTarget(attachment.title);
    onNavigate?.('resources');
  };

  const handleRenameChat = async (id, title) => {
    try {
      await renameConversation(id, title);
      setHistoryVersion((version) => version + 1);
    } catch (renameError) {
      setError(renameError.message || 'Could not rename that conversation.');
    }
  };

  const handleDeleteChat = async (id) => {
    try {
      await deleteConversation(id);
      deletedChatsRef.current.add(id);
      clearPending(id);
      if (id === activeChatRef.current) {
        setMessages([]);
        setActiveChat(null);
      }
      setHistoryVersion((version) => version + 1);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete that conversation.');
    }
  };

  const handleRegenerate = async () => {
    if (sendingRef.current || !activeChat || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'bot' || lastMessage.type !== 'text') return;

    const reqChat = activeChat;
    sendingRef.current = true;
    setError('');
    setMessages((current) => current.slice(0, -1));
    startPending(reqChat);

    try {
      const result = await regenerateLastResponse(reqChat);

      if (deletedChatsRef.current.has(reqChat)) return;

      if (isStillOnRequestChat(reqChat)) {
        setMessages((current) => [
          ...current,
          { id: result.messageId ?? null, clientId: nextClientId(), role: 'bot', text: result.response, type: result.messageType, data: result.data },
        ]);
      }
      setHistoryVersion((version) => version + 1);
    } catch (regenerateError) {
      if (isStillOnRequestChat(reqChat)) {
        setMessages((current) => [...current, lastMessage]);
        if (regenerateError.status === 404) {
          setActiveChat(null);
        }
        setError(regenerateError.message || 'Could not regenerate that response.');
      }
    } finally {
      clearPending(reqChat);
      sendingRef.current = false;
    }
  };

  // "Save as Quiz" — turn an informal chatbot mini-quiz into a persisted
  // practice quiz, then open it right here via QuizRunner (never navigates
  // away to the Learning Hub — a chat quiz lives only in the AI Assistant).
  const handleSaveAsQuiz = async (message) => {
    if (message.id == null) {
      toast.error('Give the quiz a moment to finish saving, then try again.');
      return;
    }
    const key = messageKey(message);
    setSaveQuizStates((current) => ({ ...current, [key]: 'saving' }));
    try {
      const result = await saveChatQuizAsQuiz(message.id);
      setSaveQuizStates((current) => ({ ...current, [key]: 'saved' }));
      toast.success(result.alreadySaved ? 'Already in your AI chat quizzes — opening it.' : 'Saved to your AI chat quizzes.');
      setSavedQuizzesVersion((version) => version + 1);
      setActiveQuizId(result.quizId);
    } catch (saveError) {
      setSaveQuizStates((current) => ({ ...current, [key]: 'error' }));
      toast.error(saveError.message || 'Could not save that quiz.');
    }
  };

  // Take / Retake / Resume from the Saved quizzes tab.
  const handleTakeSavedQuiz = (quizId) => {
    setActiveQuizId(quizId);
  };

  const handleCloseQuizRunner = () => {
    setActiveQuizId(null);
    setSavedQuizzesVersion((version) => version + 1);
  };

  const handleSelectChat = async (id) => {
    setChatSidebarOpen(false);
    if (id === activeChat) return;

    setError('');
    resetAttachmentState();
    setActiveChat(id);
    activeChatRef.current = id;
    setLoadingChat(true);

    try {
      const result = await getConversationMessages(id);
      if (activeChatRef.current === id) {
        setMessages(mapHistoryMessages(result.messages));
        const resource = result.conversation?.resource;
        setAttachedResource(resource ? { id: resource.id, title: resource.title } : null);
      }
    } catch (chatError) {
      if (activeChatRef.current === id) {
        setError(chatError.message || 'Could not load that conversation.');
      }
    } finally {
      if (activeChatRef.current === id) {
        setLoadingChat(false);
      }
    }
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      <ChatSidebar
        activeChat={activeChat}
        conversations={data?.conversations ?? []}
        categories={data?.categories ?? []}
        savedQuizzes={savedQuizzesData?.quizzes ?? []}
        savedQuizzesLoading={savedQuizzesLoading}
        onTakeSavedQuiz={handleTakeSavedQuiz}
        open={chatSidebarOpen}
        onClose={() => setChatSidebarOpen(false)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
      />

      {activeQuizId && <QuizRunner resumeQuizId={activeQuizId} onClose={handleCloseQuizRunner} />}

      <div className="flex-1 flex flex-col min-w-0 bg-canvas">
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-ink-100 bg-surface">
          <button
            onClick={() => setChatSidebarOpen(true)}
            aria-label="Open conversation list"
            aria-expanded={chatSidebarOpen}
            aria-controls="chat-sidebar-nav"
            className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 flex-shrink-0"
          >
            <Menu size={18} />
          </button>
          <AilaOrb size={26} pulse />
          <span className="text-sm font-semibold text-ink-800">AILA</span>
          <span className="text-xs text-ink-400 font-medium">Online</span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 lg:px-6 py-6">
          {loadingChat ? (
            <div className="flex justify-center pt-10">
              <TypingBubble />
            </div>
          ) : messages.length === 0 ? (
            <SuggestedPrompts questions={data?.suggestedQuestions ?? []} onPick={send} />
          ) : (
            <div className="flex flex-col gap-5 max-w-2xl mx-auto">
              {messages.map((message, index) => {
                const key = messageKey(message);
                const isChatbotQuiz = message.role === 'bot' && message.type === 'quiz';
                return (
                  <MessageBubble
                    key={key}
                    role={message.role}
                    text={message.text}
                    type={message.type}
                    data={message.data}
                    avatarLetter={avatarLetter}
                    isLast={index === messages.length - 1}
                    onRegenerate={handleRegenerate}
                    regenerateDisabled={isBusy}
                    quizLocalState={isChatbotQuiz ? readChatbotQuizState(message) : null}
                    onQuizLocalStateChange={isChatbotQuiz ? (state) => writeChatbotQuizState(message, state) : undefined}
                    onSaveAsQuiz={isChatbotQuiz ? () => handleSaveAsQuiz(message) : undefined}
                    saveAsQuizState={isChatbotQuiz ? (saveQuizStates[key] ?? 'idle') : 'idle'}
                    attachment={message.attachment ?? null}
                    onOpenAttachment={handleOpenAttachment}
                  />
                );
              })}
              {showTyping && <TypingBubble />}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 lg:px-6 pb-2">
            <p className="max-w-2xl mx-auto text-xs text-rose-600">{error}</p>
          </div>
        )}

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => send()}
          disabled={isBusy || Boolean(attachUpload)}
          attachedResource={attachedResource}
          attachUpload={attachUpload}
          attachError={attachError}
          onFileSelected={handleFileSelected}
          onPickFromLibrary={() => setShowAttachPicker(true)}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </div>

      {showAttachPicker && (
        <AttachResourceDialog
          onPick={handlePickFromLibrary}
          onClose={() => setShowAttachPicker(false)}
        />
      )}
    </div>
  );
}
