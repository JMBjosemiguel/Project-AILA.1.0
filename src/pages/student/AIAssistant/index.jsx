import { useEffect, useRef, useState } from 'react';
import ChatInput from '../../../components/chatbot/ChatInput';
import ChatSidebar from '../../../components/chatbot/ChatSidebar';
import MessageBubble, { TypingBubble } from '../../../components/chatbot/MessageBubble';
import SuggestedPrompts from '../../../components/chatbot/SuggestedPrompts';
import AilaOrb from '../../../components/common/AilaOrb';
import { useAuth } from '../../../contexts/AuthContext';
import { useChatbotData } from '../../../hooks/useChatbotData';
import { consumePrefillPrompt } from '../../../utils/aiPrefill';
import {
  sendChatMessage,
  getConversationMessages,
  renameConversation,
  deleteConversation,
  regenerateLastResponse,
} from '../../../services/api/chatService';

// Sentinel for an AI request that started on a brand-new chat (no server id yet).
const NEW_CHAT = Symbol('new-chat');

function conversationKey(activeChat) {
  return activeChat ?? NEW_CHAT;
}

function mapHistoryMessages(messages) {
  return messages.map((message) => ({
    role: message.sender,
    text: message.text,
    type: message.type,
    data: message.data,
  }));
}

export default function AssistantPage() {
  const { user } = useAuth();
  const [historyVersion, setHistoryVersion] = useState(0);
  const { data } = useChatbotData(historyVersion);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  // Which conversation currently owns an in-flight AI request (id, NEW_CHAT, or null).
  const [pendingChat, setPendingChat] = useState(null);
  const [error, setError] = useState('');
  const [activeChat, setActiveChat] = useState(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);
  const pendingResourceIdRef = useRef(null);
  const activeChatRef = useRef(null);
  const pendingChatRef = useRef(null);
  const deletedChatsRef = useRef(new Set());
  const avatarLetter = user?.first_name?.[0] ?? 'A';

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
    setMessages((current) => [...current, { role: 'user', text: value, type: 'text', data: null }]);
    setInput('');
    startPending(reqChat);

    const resourceId = pendingResourceIdRef.current;
    pendingResourceIdRef.current = null;

    try {
      const result = await sendChatMessage(value, activeChat, resourceId);
      const resolvedId = result.conversationId ?? null;

      if (deletedChatsRef.current.has(reqChat) || (resolvedId && deletedChatsRef.current.has(resolvedId))) {
        return; // conversation was deleted while we waited — drop the reply from the UI
      }

      if (isStillOnRequestChat(reqChat)) {
        setMessages((current) => [
          ...current,
          { role: 'bot', text: result.response, type: result.messageType, data: result.data },
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
          { role: 'bot', text: result.response, type: result.messageType, data: result.data },
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

  const handleSelectChat = async (id) => {
    if (id === activeChat) return;

    setError('');
    setActiveChat(id);
    activeChatRef.current = id;
    setLoadingChat(true);

    try {
      const result = await getConversationMessages(id);
      if (activeChatRef.current === id) {
        setMessages(mapHistoryMessages(result.messages));
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
    <div className="flex h-[calc(100vh-4rem)]">
      <ChatSidebar
        activeChat={activeChat}
        conversations={data?.conversations ?? []}
        categories={data?.categories ?? []}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-canvas">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-ink-100 bg-white">
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
              {messages.map((message, index) => (
                <MessageBubble
                  key={`${message.role}-${index}`}
                  role={message.role}
                  text={message.text}
                  type={message.type}
                  data={message.data}
                  avatarLetter={avatarLetter}
                  isLast={index === messages.length - 1}
                  onRegenerate={handleRegenerate}
                  regenerateDisabled={isBusy}
                />
              ))}
              {showTyping && <TypingBubble />}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 lg:px-6 pb-2">
            <p className="max-w-2xl mx-auto text-xs text-rose-600">{error}</p>
          </div>
        )}

        <ChatInput value={input} onChange={setInput} onSend={() => send()} disabled={isBusy} />
      </div>
    </div>
  );
}
