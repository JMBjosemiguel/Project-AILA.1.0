import { useEffect, useState } from 'react';
import { ArrowLeft, Archive, ArchiveRestore, MessageSquare, Pencil, Trash2, User } from 'lucide-react';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonList } from '../../../components/common/Skeleton';
import ActionMenu from '../../../components/common/ActionMenu';
import SearchBar from '../../../components/admin/SearchBar';
import Pagination from '../../../components/admin/Pagination';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import MessageBubble from '../../../components/chatbot/MessageBubble';
import {
  listChatSessionUsers, listChatSessionsForUser, getChatSession,
  deleteChatSession, archiveChatSession, unarchiveChatSession, renameChatSession,
} from '../../../services/api/adminChatService';

const FILTERS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'most_active', label: 'Most active' },
  { id: 'archived', label: 'Archived' },
];

function formatDate(value) {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString();
}

export default function AdminChatSessionsPage() {
  const [users, setUsers] = useState([]);
  const [usersPagination, setUsersPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [usersPage, setUsersPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');

  const [selectedUser, setSelectedUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [filter, setFilter] = useState('newest');

  const [selectedId, setSelectedId] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const confirm = useConfirm();
  const toast = useToast();

  const loadUsers = () => {
    setLoadingUsers(true);
    listChatSessionUsers({ search: userSearch, page: usersPage, pageSize: 10 })
      .then((result) => { setUsers(result.users ?? []); setUsersPagination(result.pagination); })
      .catch((error) => toast.error(error.message || 'Could not load chat sessions.'))
      .finally(() => setLoadingUsers(false));
  };

  useEffect(loadUsers, [userSearch, usersPage]);
  useEffect(() => { setUsersPage(1); }, [userSearch]);

  const loadConversations = (user, filterValue = filter) => {
    setLoadingConversations(true);
    listChatSessionsForUser(user.id, { filter: filterValue, page: 1, pageSize: 50 })
      .then((result) => setConversations(result.conversations ?? []))
      .catch((error) => toast.error(error.message || 'Could not load those conversations.'))
      .finally(() => setLoadingConversations(false));
  };

  const openUser = (user) => {
    setSelectedUser(user);
    setSelectedId(null);
    setTranscript(null);
    setFilter('newest');
    loadConversations(user, 'newest');
  };

  const backToUsers = () => {
    setSelectedUser(null);
    setConversations([]);
    setSelectedId(null);
    setTranscript(null);
  };

  const changeFilter = (nextFilter) => {
    setFilter(nextFilter);
    if (selectedUser) loadConversations(selectedUser, nextFilter);
  };

  const openConversation = async (id) => {
    setSelectedId(id);
    setLoadingTranscript(true);
    try {
      const result = await getChatSession(id);
      setTranscript(result);
    } catch (error) {
      toast.error(error.message || 'Could not load that conversation.');
    } finally {
      setLoadingTranscript(false);
    }
  };

  const handleDelete = async (conversationId) => {
    const ok = await confirm({ title: 'Delete this conversation?', message: 'This conversation and its messages will be permanently removed.' });
    if (!ok) return;

    try {
      await deleteChatSession(conversationId);
      setConversations((current) => current.filter((c) => c.id !== conversationId));
      if (selectedId === conversationId) { setSelectedId(null); setTranscript(null); }
      toast.success('Conversation deleted.');
    } catch (error) {
      toast.error(error.message || 'Could not delete that conversation.');
    }
  };

  const handleArchiveToggle = async (conversation) => {
    try {
      if (conversation.is_archived) await unarchiveChatSession(conversation.id);
      else await archiveChatSession(conversation.id);
      toast.success(conversation.is_archived ? 'Conversation unarchived.' : 'Conversation archived.');
      loadConversations(selectedUser, filter);
    } catch (error) {
      toast.error(error.message || 'Could not update that conversation.');
    }
  };

  const startRename = (conversation) => {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title || '');
  };

  const submitRename = async (conversationId) => {
    try {
      await renameChatSession(conversationId, renameValue.trim() || 'Untitled conversation');
      toast.success('Conversation renamed.');
      setRenamingId(null);
      loadConversations(selectedUser, filter);
      if (transcript?.conversation?.id === conversationId) {
        setTranscript((current) => ({ ...current, conversation: { ...current.conversation, title: renameValue.trim() } }));
      }
    } catch (error) {
      toast.error(error.message || 'Could not rename that conversation.');
    }
  };

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="grid grid-cols-1 lg:grid-cols-[19rem_1fr] gap-5 items-start">
        <Card padded={false} className="overflow-hidden">
          {!selectedUser ? (
            <>
              <div className="p-4 border-b border-ink-100">
                <h3 className="text-[0.95rem] font-semibold text-ink-800 mb-3">Students</h3>
                <SearchBar value={userSearch} onChange={setUserSearch} placeholder="Search students..." />
              </div>
              <div className="max-h-[55vh] overflow-y-auto scrollbar-thin">
                {loadingUsers ? (
                  <div className="p-4"><SkeletonList count={5} /></div>
                ) : users.length === 0 ? (
                  <EmptyState title="No conversations yet" message="Student conversations with AILA will appear here." className="m-4 border-0" />
                ) : (
                  users.map((user) => (
                    <button key={user.id} onClick={() => openUser(user)} className="w-full text-left px-4 py-3 border-b border-ink-50 hover:bg-ink-50 transition-colors">
                      <div className="flex items-center gap-2 text-sm font-medium text-ink-800 truncate">
                        <User size={13} className="text-primary flex-shrink-0" />
                        <span className="truncate">{user.first_name} {user.last_name}</span>
                      </div>
                      <p className="text-xs text-ink-400 mt-1 truncate">{user.email}</p>
                      <p className="text-[0.7rem] text-ink-400 mt-0.5">{user.conversation_count} conversations · {formatDate(user.last_activity_at)}</p>
                    </button>
                  ))
                )}
              </div>
              <Pagination page={usersPagination.page} totalPages={usersPagination.totalPages} total={usersPagination.total} pageSize={usersPagination.pageSize} onPageChange={setUsersPage} />
            </>
          ) : (
            <>
              <div className="p-4 border-b border-ink-100">
                <button onClick={backToUsers} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-600 mb-3">
                  <ArrowLeft size={13} /> Back to students
                </button>
                <h3 className="text-[0.95rem] font-semibold text-ink-800">{selectedUser.first_name} {selectedUser.last_name}</h3>
                <p className="text-xs text-ink-400">{selectedUser.email}</p>
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => changeFilter(f.id)}
                      className={`text-[0.7rem] font-semibold px-2.5 py-1 rounded-full border transition-colors ${filter === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[55vh] overflow-y-auto scrollbar-thin">
                {loadingConversations ? (
                  <div className="p-4"><SkeletonList count={4} /></div>
                ) : conversations.length === 0 ? (
                  <EmptyState title="No conversations here" message="This student hasn't started any AI conversations in this view." className="m-4 border-0" />
                ) : (
                  conversations.map((conversation) => (
                    <div key={conversation.id} className={`flex items-start gap-1 px-2 py-1 border-b border-ink-50 ${selectedId === conversation.id ? 'bg-primary-50' : 'hover:bg-ink-50'} transition-colors`}>
                      {renamingId === conversation.id ? (
                        <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && submitRename(conversation.id)}
                            className="flex-1 text-sm border border-primary-200 rounded-lg px-2 py-1 outline-none"
                          />
                          <button onClick={() => submitRename(conversation.id)} className="text-xs font-semibold text-primary">Save</button>
                        </div>
                      ) : (
                        <button onClick={() => openConversation(conversation.id)} className="flex-1 text-left px-2 py-2 min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium text-ink-800 truncate">
                            <MessageSquare size={13} className="text-primary flex-shrink-0" />
                            <span className="truncate">{conversation.title || `Conversation ${conversation.id}`}</span>
                          </div>
                          <p className="text-[0.7rem] text-ink-400 mt-0.5">
                            {conversation.message_count} messages · {formatDate(conversation.last_activity_at)}
                          </p>
                        </button>
                      )}
                      <ActionMenu
                        label={`Actions for conversation ${conversation.id}`}
                        items={[
                          { label: 'Rename', icon: <Pencil size={14} />, onClick: () => startRename(conversation) },
                          {
                            label: conversation.is_archived ? 'Unarchive' : 'Archive',
                            icon: conversation.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
                            onClick: () => handleArchiveToggle(conversation),
                          },
                          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(conversation.id) },
                        ]}
                      />
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </Card>

        <Card className="min-h-[65vh]">
          {!selectedId ? (
            <EmptyState title="Select a conversation" message="Choose a student, then a conversation, to review its transcript." />
          ) : loadingTranscript ? (
            <SkeletonList count={4} />
          ) : transcript ? (
            <>
              <CardHeader
                title={transcript.conversation.title || `Conversation ${transcript.conversation.id}`}
                subtitle={`${transcript.conversation.first_name} ${transcript.conversation.last_name} · ${transcript.conversation.email}`}
              />
              <div className="flex flex-col gap-4 max-h-[55vh] overflow-y-auto scrollbar-thin pr-1">
                {transcript.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    role={message.sender}
                    text={message.text}
                    type={message.type}
                    data={message.data}
                    avatarLetter={transcript.conversation.first_name?.[0] ?? 'S'}
                  />
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
