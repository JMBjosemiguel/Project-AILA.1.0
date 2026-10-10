import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import Button from '../../../components/common/Button';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import { useToast } from '../../../components/common/Toast';
import { listAuditLog, exportAuditLog } from '../../../services/api/adminService';
import { formatDateTime } from '../../../utils/formatDate';

function actionLabel(action) {
  return action.replace(/_/g, ' ').replace(/\./g, ' · ');
}

const ROLE_FILTERS = [
  { id: 'all', label: 'All roles' },
  { id: 'admin', label: 'Admin' },
  { id: 'student', label: 'Student' },
];

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [actions, setActions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [role, setRole] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    listAuditLog({ search, action, role, from, to, page, pageSize: 15 })
      .then((result) => { setEntries(result.entries ?? []); setActions(result.actions ?? []); setPagination(result.pagination); })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, action, role, from, to, page]);
  useEffect(() => { setPage(1); }, [search, action, role, from, to]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAuditLog({ search, action, role, from, to });
    } catch (error) {
      toast.error(error.message || 'Could not export the audit log.');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    { key: 'timestamp', label: 'Timestamp', render: (e) => <span className="text-ink-500 whitespace-nowrap">{formatDateTime(e.created_at)}</span> },
    {
      key: 'user',
      label: 'User',
      render: (e) => (
        <span className="flex items-center gap-2">
          <span className="text-ink-700 font-medium">{e.first_name} {e.last_name}</span>
          <span className="text-ink-400 text-xs">#{e.admin_id}</span>
          <span className={`text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full ${e.role === 'admin' ? 'bg-primary-50 text-primary' : 'bg-ink-50 text-ink-500'}`}>
            {e.role}
          </span>
        </span>
      ),
    },
    { key: 'action', label: 'Action', render: (e) => <span className="text-ink-600 capitalize">{actionLabel(e.action)}</span> },
    {
      key: 'target',
      label: 'Affected object',
      render: (e) => (
        <span className="text-ink-500">
          {e.target_name
            ? <>{e.target_name}{e.target_id ? <span className="text-ink-400"> (#{e.target_id})</span> : null}</>
            : <span className="capitalize">{e.target_table.replace(/_/g, ' ')}{e.target_id ? ` #${e.target_id}` : ''}</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or action..." className="flex-1" />
        <div className="flex gap-2 flex-wrap items-center">
          <select value={role} onChange={(event) => setRole(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-surface text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-primary-200">
            {ROLE_FILTERS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <select value={action} onChange={(event) => setAction(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-surface text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-primary-200">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-surface text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-primary-200" />
          <span className="text-xs text-ink-400">to</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-surface text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-primary-200" />
          <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={entries}
        loading={loading}
        error={error}
        onRetry={load}
        emptyState={{ icon: ScrollText, title: 'No activity yet', message: 'Actions taken by admins and students will be recorded here.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />
    </div>
  );
}
