import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Megaphone, Pencil, Send, Trash2 } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import AnnouncementEditDialog from '../../../components/admin/AnnouncementEditDialog';
import {
  listAnnouncements, archiveAnnouncement, unarchiveAnnouncement, deleteAnnouncement,
  sendAnnouncement, listAdminUsers, listAdminCourses,
} from '../../../services/api/adminService';

const TARGET_TYPES = [
  { id: 'all', label: 'Everyone' },
  { id: 'user', label: 'Specific student' },
  { id: 'course', label: 'Specific course' },
  { id: 'year_level', label: 'Year level' },
  { id: 'role', label: 'Role' },
];

const YEAR_LEVELS = [1, 2, 3, 4];
const ROLES = ['student', 'admin'];

const ARCHIVED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

function targetLabel(a) {
  if (a.target_type === 'all') return 'Everyone';
  if (a.target_type === 'user') return 'Specific student';
  if (a.target_type === 'course') return 'Specific course';
  if (a.target_type === 'year_level') return `Year ${a.target_value}`;
  if (a.target_type === 'role') return `Role: ${a.target_value}`;
  return a.target_type;
}

export default function AdminSettingsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [targetValue, setTargetValue] = useState('');
  const [sending, setSending] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);

  const [announcements, setAnnouncements] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState('all');
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    setLoading(true);
    listAnnouncements({ search, archived, sort: 'newest', page, pageSize: 10 })
      .then((result) => { setAnnouncements(result.announcements ?? []); setPagination(result.pagination); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, archived, page]);
  useEffect(() => { setPage(1); }, [search, archived]);

  useEffect(() => {
    if (targetType === 'user' && !userOptions.length) {
      listAdminUsers({ role: 'student', page: 1, pageSize: 100, sort: 'name' }).then((result) => setUserOptions(result.users ?? []));
    }
    if (targetType === 'course' && !courseOptions.length) {
      listAdminCourses({ page: 1, pageSize: 100, sort: 'name' }).then((result) => setCourseOptions(result.courses ?? []));
    }
    setTargetValue('');
  }, [targetType]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    if (targetType !== 'all' && !targetValue) {
      toast.error('Choose a target before sending.');
      return;
    }
    setSending(true);
    try {
      const result = await sendAnnouncement(title.trim(), body.trim(), targetType, targetValue || undefined);
      toast.success(`Sent to ${result.notified} student${result.notified === 1 ? '' : 's'}.`);
      setTitle('');
      setBody('');
      setTargetType('all');
      setTargetValue('');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not send that announcement.');
    } finally {
      setSending(false);
    }
  };

  const handleArchiveToggle = async (item) => {
    try {
      if (item.is_archived) await unarchiveAnnouncement(item.id);
      else await archiveAnnouncement(item.id);
      toast.success(item.is_archived ? 'Announcement unarchived.' : 'Announcement archived.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not update that announcement.');
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirm({ title: 'Delete this announcement?', message: 'It will be permanently removed from every recipient\'s notifications.' });
    if (!ok) return;
    try {
      await deleteAnnouncement(item.id);
      toast.success('Announcement deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that announcement.');
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Announcement',
      render: (a) => (
        <div>
          <span className="font-medium text-ink-800">{a.title}</span>
          {a.is_archived ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-400">Archived</span> : ''}
          <p className="text-xs text-ink-400 mt-0.5 line-clamp-1 max-w-sm">{a.body}</p>
        </div>
      ),
    },
    { key: 'target', label: 'Target', render: (a) => <span className="text-ink-500">{targetLabel(a)}</span> },
    { key: 'recipients', label: 'Recipients', render: (a) => <span className="text-ink-500">{a.recipient_count}</span> },
    { key: 'read', label: 'Read', render: (a) => <span className="text-ink-500">{a.recipient_count ? `${Math.round((a.read_count / a.recipient_count) * 100)}%` : '—'}</span> },
    { key: 'sent', label: 'Sent', render: (a) => <span className="text-ink-500">{new Date(a.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (a) => (
        <ActionMenu
          label={`Actions for ${a.title}`}
          items={[
            { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditTarget(a) },
            a.is_archived
              ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onClick: () => handleArchiveToggle(a) }
              : { label: 'Archive', icon: <Archive size={14} />, onClick: () => handleArchiveToggle(a) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(a) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp flex flex-col gap-5">
      <Card>
        <CardHeader title="New announcement" subtitle="Broadcast a notification to students." />
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message"
            rows={3}
            className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            {TARGET_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTargetType(t.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${targetType === t.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {targetType === 'user' && (
            <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="">Select a student...</option>
              {userOptions.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          )}
          {targetType === 'course' && (
            <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="">Select a course...</option>
              {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.first_name} {c.last_name})</option>)}
            </select>
          )}
          {targetType === 'year_level' && (
            <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="">Select a year level...</option>
              {YEAR_LEVELS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          )}
          {targetType === 'role' && (
            <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="border border-ink-100 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="">Select a role...</option>
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          )}

          <Button size="sm" icon={<Send size={14} />} onClick={handleSend} disabled={sending} className="self-start">
            {sending ? 'Sending...' : 'Send announcement'}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search announcements..." className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          {ARCHIVED_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setArchived(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${archived === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={announcements}
        loading={loading}
        emptyState={{ icon: Megaphone, title: 'No announcements sent yet', message: 'Announcements you send to students will appear here.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {editTarget && (
        <AnnouncementEditDialog
          announcement={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
