import { useEffect, useState } from 'react';
import {
  Archive, ArchiveRestore, Download, ExternalLink, Eye, FolderOpen, Info, Trash2,
} from 'lucide-react';
import Button from '../../../components/common/Button';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import ResourceDetailDialog from '../../../components/admin/ResourceDetailDialog';
import {
  listAdminResources, deleteAdminResource, archiveAdminResource, unarchiveAdminResource, bulkResourceAction,
  openAdminResourceFile, downloadAdminResource,
} from '../../../services/api/adminService';
import { RESOURCE_TYPES } from '../../../constants/ui';

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title', label: 'Title' },
  { id: 'size', label: 'Size' },
];

const ARCHIVED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

function parseResource(resource) {
  return {
    ...resource,
    ai_keywords: typeof resource.ai_keywords === 'string' ? JSON.parse(resource.ai_keywords || '[]') : (resource.ai_keywords || []),
  };
}

export default function AdminResourcesPage() {
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [archived, setArchived] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [detailResource, setDetailResource] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    listAdminResources({ search, type, archived, sort, page, pageSize: 10 })
      .then((result) => {
        setResources((result.resources ?? []).map(parseResource));
        setPagination(result.pagination);
        setSelected([]);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, type, archived, sort, page]);
  useEffect(() => { setPage(1); }, [search, type, archived, sort]);

  const handleOpen = async (resource) => {
    try {
      await openAdminResourceFile(resource.id, resource.title, resource.type);
    } catch (error) {
      toast.error(error.message || 'Could not open this file.');
    }
  };

  const handleDownload = async (resource) => {
    try {
      await downloadAdminResource(resource.id, resource.title);
    } catch (error) {
      toast.error(error.message || 'Could not download this file.');
    }
  };

  const handleDelete = async (resource) => {
    const ok = await confirm({ title: 'Delete this resource?', message: `"${resource.title}" and its file will be permanently removed.` });
    if (!ok) return;
    try {
      await deleteAdminResource(resource.id);
      toast.success('Resource deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that resource.');
    }
  };

  const handleArchiveToggle = async (resource) => {
    try {
      if (resource.is_archived) await unarchiveAdminResource(resource.id);
      else await archiveAdminResource(resource.id);
      toast.success(resource.is_archived ? 'Resource unarchived.' : 'Resource archived.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not update that resource.');
    }
  };

  const handleBulk = async (action) => {
    const verb = { delete: 'Delete', archive: 'Archive' }[action];
    const ok = await confirm({ title: `${verb} ${selected.length} resource${selected.length === 1 ? '' : 's'}?`, message: 'This applies to every selected file.' });
    if (!ok) return;
    try {
      await bulkResourceAction(selected, action);
      toast.success(`${verb}d ${selected.length} resource${selected.length === 1 ? '' : 's'}.`);
      load();
    } catch (error) {
      toast.error(error.message || 'Bulk action failed.');
    }
  };

  const toggleSelectAll = () => {
    setSelected((current) => (current.length === resources.length ? [] : resources.map((r) => r.id)));
  };

  const columns = [
    {
      key: 'select',
      label: <input type="checkbox" checked={resources.length > 0 && selected.length === resources.length} onChange={toggleSelectAll} aria-label="Select all" />,
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.includes(r.id)}
          onChange={() => setSelected((current) => (current.includes(r.id) ? current.filter((id) => id !== r.id) : [...current, r.id]))}
          aria-label={`Select ${r.title}`}
          onClick={(event) => event.stopPropagation()}
        />
      ),
    },
    { key: 'title', label: 'Title', render: (r) => <span className="font-medium text-ink-800">{r.title}{r.is_archived ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-400">Archived</span> : ''}</span> },
    { key: 'type', label: 'Type', render: (r) => <span className="text-ink-500 uppercase text-xs font-semibold">{r.type}</span> },
    { key: 'owner', label: 'Owner', render: (r) => <span className="text-ink-500">{r.first_name ? `${r.first_name} ${r.last_name}` : 'Admin'}</span> },
    { key: 'course', label: 'Course', render: (r) => <span className="text-ink-500">{r.course_name || '—'}</span> },
    { key: 'views', label: 'Views', render: (r) => <span className="text-ink-500">{r.view_count}</span> },
    { key: 'uploaded', label: 'Uploaded', render: (r) => <span className="text-ink-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.title}`}
          items={[
            { label: 'Open', icon: r.external_url ? <ExternalLink size={14} /> : <Eye size={14} />, onClick: () => handleOpen(r) },
            { label: 'View Details', icon: <Info size={14} />, onClick: () => setDetailResource(r) },
            ...(r.file_path ? [{ label: 'Download', icon: <Download size={14} />, onClick: () => handleDownload(r) }] : []),
            r.is_archived
              ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onClick: () => handleArchiveToggle(r) }
              : { label: 'Archive', icon: <Archive size={14} />, onClick: () => handleArchiveToggle(r) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by title or owner..." className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          {ARCHIVED_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setArchived(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${archived === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}>
              {f.label}
            </button>
          ))}
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-white text-ink-600 outline-none">
            {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {RESOURCE_TYPES.map((resourceType) => (
          <button
            key={resourceType}
            onClick={() => setType(resourceType)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize ${type === resourceType ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}
          >
            {resourceType}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-primary-50 border border-primary-100 rounded-xl">
          <span className="text-xs font-semibold text-primary">{selected.length} selected</span>
          <Button size="sm" variant="outline" icon={<Archive size={13} />} onClick={() => handleBulk('archive')}>Bulk Archive</Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => handleBulk('delete')}>Bulk Delete</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={resources}
        loading={loading}
        error={error}
        onRetry={load}
        emptyState={{ icon: FolderOpen, title: 'No resources found', message: 'Try a different search or filter.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {detailResource && <ResourceDetailDialog resource={detailResource} onClose={() => setDetailResource(null)} />}
    </div>
  );
}
