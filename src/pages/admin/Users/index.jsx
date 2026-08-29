import { useEffect, useState } from 'react';
import { Eye, RotateCcw, Trash2, UserCheck, UserX, Users as UsersIcon } from 'lucide-react';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import UserDetailDialog from '../../../components/admin/UserDetailDialog';
import {
  deleteAdminUser, listAdminUsers, resetUserProgress, setUserActive,
} from '../../../services/api/adminService';

const ROLE_FILTERS = [
  { id: 'all', label: 'All roles' },
  { id: 'student', label: 'Students' },
  { id: 'admin', label: 'Admins' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All status' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
  { id: 'last_login', label: 'Last login' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    setLoading(true);
    listAdminUsers({ search, role, status, sort, page, pageSize: 10 })
      .then((result) => {
        setUsers(result.users ?? []);
        setPagination(result.pagination);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, role, status, sort, page]);

  useEffect(() => { setPage(1); }, [search, role, status, sort]);

  const toggleActive = async (user) => {
    try {
      await setUserActive(user.id, !user.is_active);
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: !item.is_active } : item)));
      toast.success(user.is_active ? 'Student deactivated.' : 'Student reactivated.');
    } catch (error) {
      toast.error(error.message || 'Could not update that student.');
    }
  };

  const handleReset = async (user) => {
    const ok = await confirm({
      title: 'Reset this student\'s progress?',
      message: `All of ${user.first_name}'s lesson/quiz progress, XP, and streak will be permanently cleared. Their account and courses stay intact.`,
    });
    if (!ok) return;

    try {
      await resetUserProgress(user.id);
      toast.success("Student's progress has been reset.");
    } catch (error) {
      toast.error(error.message || 'Could not reset that student\'s progress.');
    }
  };

  const handleDelete = async (user) => {
    const ok = await confirm({
      title: 'Delete this student?',
      message: `"${user.first_name} ${user.last_name}" will be permanently removed from the active roster. This can't be undone.`,
    });
    if (!ok) return;

    try {
      await deleteAdminUser(user.id);
      toast.success('Student deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that student.');
    }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (u) => <span className="font-medium text-ink-800">{u.first_name} {u.last_name}</span> },
    { key: 'email', label: 'Email', render: (u) => <span className="text-ink-500">{u.email}</span> },
    { key: 'program', label: 'Program', render: (u) => <span className="text-ink-500">{u.program || '—'}{u.year_level ? ` · Yr ${u.year_level}` : ''}</span> },
    { key: 'level', label: 'Level / XP', render: (u) => <span className="text-ink-500">Lv.{u.level ?? 1} · {u.xp_points ?? 0} XP</span> },
    { key: 'role', label: 'Role', render: (u) => <span className="text-ink-500 capitalize">{u.role}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-ink-50 text-ink-400'}`}>
          {u.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (u) => (
        <ActionMenu
          label={`Actions for ${u.first_name} ${u.last_name}`}
          items={[
            { label: 'View Profile', icon: <Eye size={14} />, onClick: () => setSelectedUserId(u.id) },
            u.role === 'student'
              ? { label: u.is_active ? 'Deactivate' : 'Reactivate', icon: u.is_active ? <UserX size={14} /> : <UserCheck size={14} />, onClick: () => toggleActive(u) }
              : null,
            u.role === 'student' ? { label: 'Reset Progress', icon: <RotateCcw size={14} />, onClick: () => handleReset(u) } : null,
            u.role === 'student' ? { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(u) } : null,
          ].filter(Boolean)}
        />
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or student number..." className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          {ROLE_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setRole(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${role === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300'}`}>
              {f.label}
            </button>
          ))}
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

      <DataTable
        columns={columns}
        rows={users}
        loading={loading}
        emptyState={{ icon: UsersIcon, title: 'No students found', message: 'Try a different search or filter.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {selectedUserId && <UserDetailDialog userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
