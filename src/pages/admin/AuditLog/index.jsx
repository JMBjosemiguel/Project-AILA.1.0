import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import Button from '../../../components/common/Button';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import { useToast } from '../../../components/common/Toast';
import { listAuditLog, exportAuditLog } from '../../../services/api/adminService';

function actionLabel(action) {
  return action.replace(/_/g, ' ').replace(/\./g, ' · ');
}

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [actions, setActions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    listAuditLog({ search, action, from, to, page, pageSize: 15 })
      .then((result) => { setEntries(result.entries ?? []); setActions(result.actions ?? []); setPagination(result.pagination); })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, action, from, to, page]);
  useEffect(() => { setPage(1); }, [search, action, from, to]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAuditLog({ search, action, from, to });
    } catch (error) {
      toast.error(error.message || 'Could not export the audit log.');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    { key: 'timestamp', label: 'Timestamp', render: (e) => <span className="text-ink-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span> },
    { key: 'admin', label: 'Admin', render: (e) => <span className="text-ink-700 font-medium">{e.first_name} {e.last_name}</span> },
    { key: 'action', label: 'Action', render: (e) => <span className="text-ink-600 capitalize">{actionLabel(e.action)}</span> },
    {
      key: 'target',
      label: 'Affected object',
      render: (e) => <span className="text-ink-500 capitalize">{e.target_table.replace(/_/g, ' ')}{e.target_id ? ` #${e.target_id}` : ''}</span>,
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by admin or action..." className="flex-1" />
        <div className="flex gap-2 flex-wrap items-center">
          <select value={action} onChange={(event) => setAction(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none" />
          <span className="text-xs text-ink-400">to</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none" />
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
        emptyState={{ icon: ScrollText, title: 'No admin activity yet', message: 'Actions taken by administrators will be recorded here.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />
    </div>
  );
}
