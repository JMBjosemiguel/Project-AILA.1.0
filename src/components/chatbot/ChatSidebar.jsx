import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import EmptyState from '../common/EmptyState';

export default function ChatSidebar({
  activeChat,
  conversations = [],
  categories = [],
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
}) {
  const [search, setSearch] = useState('');

  const filteredConversations = search.trim()
    ? conversations.filter((conversation) =>
        (conversation.title ?? '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : conversations;

  return (
    <div className="hidden md:flex flex-col w-64 flex-shrink-0 border-r border-ink-100 bg-white p-3 gap-4 overflow-y-auto scrollbar-thin">
      <button
        onClick={onNewChat}
        className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold rounded-xl py-2.5 hover:bg-primary-600 transition-colors"
      >
        <Plus size={16} /> New chat
      </button>

      {conversations.length > 0 && (
        <div className="flex items-center gap-2 bg-canvas border border-ink-100 rounded-xl px-2.5 py-1.5">
          <Search size={13} className="text-ink-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats..."
            className="flex-1 min-w-0 bg-transparent outline-none text-xs text-ink-800 placeholder:text-ink-400"
          />
        </div>
      )}

      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400/80 px-2 mb-1.5">Conversations</div>
        <div className="flex flex-col gap-0.5">
          {filteredConversations.length ? filteredConversations.map((conversation) => (
            <ChatItem
              key={conversation.id}
              chat={conversation}
              active={activeChat === conversation.id}
              onClick={() => onSelectChat(conversation.id)}
              onRename={onRenameChat}
              onDelete={onDeleteChat}
            />
          )) : (
            <EmptyState
              title={search ? 'No matches' : 'No conversations'}
              message={search ? 'Try a different search term.' : 'Start a new chat to begin talking with AILA.'}
              className="py-6"
            />
          )}
        </div>
      </div>

      {categories.length > 0 && (
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400/80 px-2 mb-1.5">By category</div>
          <div className="flex flex-col gap-0.5">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink-600 hover:bg-ink-50 cursor-pointer transition-colors">
                {category.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatItem({ chat, active, onClick, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const label = chat.title || (chat.started_at ? `Chat from ${new Date(chat.started_at).toLocaleDateString()}` : 'New conversation');

  const startEdit = (event) => {
    event.stopPropagation();
    setTitle(chat.title ?? '');
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = title.trim();
    setEditing(false);
    if (trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setTitle(chat.title ?? '');
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <MessageSquare size={14} className="flex-shrink-0 text-ink-400" />
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={saveEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveEdit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEdit();
            }
          }}
          className="flex-1 min-w-0 text-sm bg-white border border-primary-300 rounded-md px-1.5 py-0.5 outline-none"
        />
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-rose-50">
        <span className="text-xs text-rose-600 truncate">Delete this chat?</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setConfirmingDelete(false)}
            className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-800 px-1.5 py-0.5"
          >
            Cancel
          </button>
          <button
            onClick={() => onDelete(chat.id)}
            className="text-[0.65rem] font-semibold text-rose-600 hover:text-rose-700 px-1.5 py-0.5"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'group flex items-center gap-1 pl-1 pr-0.5 py-0.5 rounded-lg transition-colors',
        active ? 'bg-primary-50' : 'hover:bg-ink-50',
      ].join(' ')}
    >
      <button
        onClick={onClick}
        className={[
          'flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-sm text-left truncate',
          active ? 'text-primary font-medium' : 'text-ink-600',
        ].join(' ')}
      >
        <MessageSquare size={14} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={startEdit}
          className="w-5 h-5 flex items-center justify-center rounded text-ink-400 hover:text-primary hover:bg-white"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            setConfirmingDelete(true);
          }}
          className="w-5 h-5 flex items-center justify-center rounded text-ink-400 hover:text-rose-600 hover:bg-white"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
