import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, MessageSquare, RotateCcw, Star, Trash2 } from 'lucide-react';
import Card, { CardHeader } from '../../../components/common/Card';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import FeedbackReplyDialog from '../../../components/admin/FeedbackReplyDialog';
import DonutChart from '../../../components/analytics/DonutChart';
import {
  listAdminFeedback, getAdminFeedbackAnalytics, archiveAdminFeedback, unarchiveAdminFeedback, deleteAdminFeedback, restoreAdminFeedback,
} from '../../../services/api/adminService';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'resolved', label: 'Resolved' },
];

const ARCHIVED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'deleted', label: 'Deleted' },
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'rating_high', label: 'Highest rating' },
  { id: 'rating_low', label: 'Lowest rating' },
];

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={12} className={index < rating ? 'text-amber-400 fill-amber-400' : 'text-ink-200'} />
      ))}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [rating, setRating] = useState('all');
  const [archived, setArchived] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [replyTarget, setReplyTarget] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    setLoading(true);
    listAdminFeedback({ search, status, rating, archived, sort, page, pageSize: 10 })
      .then((result) => { setFeedback(result.feedback ?? []); setPagination(result.pagination); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, status, rating, archived, sort, page]);
  useEffect(() => { setPage(1); }, [search, status, rating, archived, sort]);
  useEffect(() => { getAdminFeedbackAnalytics().then(setAnalytics); }, []);

  const handleArchiveToggle = async (item) => {
    try {
      if (item.is_archived) await unarchiveAdminFeedback(item.id);
      else await archiveAdminFeedback(item.id);
      toast.success(item.is_archived ? 'Feedback unarchived.' : 'Feedback archived.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not update that feedback.');
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirm({ title: 'Delete this feedback?', message: 'This feedback entry will be permanently removed.' });
    if (!ok) return;
    try {
      await deleteAdminFeedback(item.id);
      toast.success('Feedback deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that feedback.');
    }
  };

  const handleRestore = async (item) => {
    try {
      await restoreAdminFeedback(item.id);
      toast.success('Feedback restored.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not restore that feedback.');
    }
  };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (f) => (
        <div>
          <span className="font-medium text-ink-800">{f.first_name} {f.last_name}</span>
          {f.deleted_at ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500">Deleted</span>
            : f.is_archived ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-400">Archived</span> : ''}
        </div>
      ),
    },
    { key: 'rating', label: 'Rating', render: (f) => <Stars rating={f.rating} /> },
    { key: 'comment', label: 'Comment', render: (f) => <span className="text-ink-500 line-clamp-1 max-w-xs block">{f.comment || '—'}</span> },
    { key: 'context', label: 'Context', render: (f) => <span className="text-ink-500 capitalize">{f.context_type?.replace('_', ' ') || 'General'}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (f) => (
        <span className={`text-[0.65rem] font-bold uppercase px-2 py-0.5 rounded-full ${f.status === 'resolved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          {f.status}
        </span>
      ),
    },
    { key: 'created', label: 'Date', render: (f) => <span className="text-ink-500">{new Date(f.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (f) => (
        <ActionMenu
          label={`Actions for feedback from ${f.first_name}`}
          items={f.deleted_at ? [
            { label: 'Restore', icon: <RotateCcw size={14} />, onClick: () => handleRestore(f) },
          ] : [
            { label: 'Reply / Resolve', icon: <MessageSquare size={14} />, onClick: () => setReplyTarget(f) },
            f.is_archived
              ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onClick: () => handleArchiveToggle(f) }
              : { label: 'Archive', icon: <Archive size={14} />, onClick: () => handleArchiveToggle(f) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(f) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp flex flex-col gap-5">
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Average rating</span>
              <span className="text-2xl font-display font-bold text-ink-800">{analytics.summary.averageRating ?? '—'}</span>
              <span className="text-xs text-ink-400">{analytics.summary.totalResponses} total responses</span>
            </div>
          </Card>
          <Card>
            <CardHeader title="Rating distribution" />
            <DonutChart data={analytics.summary.distribution.filter((d) => d.pct > 0)} />
          </Card>
          <Card>
            <CardHeader title="Feedback by area" />
            <div className="flex flex-col gap-1.5">
              {analytics.contextBreakdown.map((c) => (
                <div key={c.context_type} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600 capitalize">{c.context_type.replace('_', ' ')}</span>
                  <span className="text-ink-400 font-semibold">{c.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by comment or student..." className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setStatus(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${status === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}>
              {f.label}
            </button>
          ))}
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none">
            {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={rating} onChange={(event) => setRating(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none">
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r === 1 ? '' : 's'}</option>)}
        </select>
        {ARCHIVED_FILTERS.map((f) => (
          <button key={f.id} onClick={() => setArchived(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${archived === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={feedback}
        loading={loading}
        emptyState={{ icon: MessageSquare, title: 'No feedback has been submitted yet', message: 'Ratings and comments from students will appear here.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {replyTarget && (
        <FeedbackReplyDialog
          feedback={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSaved={() => { setReplyTarget(null); load(); }}
        />
      )}
    </div>
  );
}
