import { useEffect, useState } from 'react';
import { Eye, RotateCcw, ShieldCheck, Trash2, UserCheck, UserX, Users as UsersIcon } from 'lucide-react';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import UserDetailDialog from '../../../components/admin/UserDetailDialog';
import {
  deleteAdminUser, listAdminUsers, promoteToAdmin, resetUserProgress, setUserActive,
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

// Email verification is a SEPARATE signal from account active/inactive status
// (a student can be active-but-unverified while their link is still pending).
const VERIFICATION_FILTERS = [
  { id: 'all', label: 'All verification' },
  { id: 'verified', label: 'Verified' },
  { id: 'pending', label: 'Pending verification' },
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
  { id: 'last_login', label: 'Last login' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [verification, setVerification] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();
  const { user: currentUser } = useAuth();

  // A "View details" link elsewhere (e.g. the Dashboard's "Students who may
  // need help" card) opens this page with ?userId=<id> in the URL — pick it
  // up once on mount and open that student's detail dialog directly, then
  // clean the query string so a later reload/back doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    if (userId) {
      setSelectedUserId(Number(userId));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    listAdminUsers({ search, role, status, verification, sort, page, pageSize: 10 })
      .then((result) => {
        setUsers(result.users ?? []);
        setPagination(result.pagination);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, role, status, verification, sort, page]);

  useEffect(() => { setPage(1); }, [search, role, status, verification, sort]);

  const toggleActive = async (user) => {
    try {
      await setUserActive(user.id, !user.is_active);
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: !item.is_active } : item)));
      toast.success(user.is_active ? 'Account deactivated.' : 'Account reactivated.');
    } catch (error) {
      toast.error(error.message || 'Could not update that account.');
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

  const handlePromote = async (user) => {
    const ok = await confirm({
      title: 'Promote this student to admin?',
      message: `"${user.first_name} ${user.last_name}" will become an admin. This can't be undone from the app, and they will lose access to the student side (their progress is kept, just no longer reachable as a student).`,
      confirmLabel: 'Promote',
    });
    if (!ok) return;

    try {
      await promoteToAdmin(user.id);
      toast.success(`${user.first_name} is now an admin.`);
      load();
    } catch (error) {
      toast.error(error.message || 'Could not promote that student.');
    }
  };

  const handleDelete = async (user) => {
    const isAdmin = user.role === 'admin';
    const ok = await confirm({
      title: isAdmin ? `Delete admin account ${user.first_name} ${user.last_name}?` : 'Delete this student?',
      message: isAdmin
        ? "They will lose admin access immediately. This can't be undone."
        : `"${user.first_name} ${user.last_name}" will be permanently removed from the active roster. This can't be undone.`,
    });
    if (!ok) return;

    try {
      await deleteAdminUser(user.id);
      toast.success(isAdmin ? 'Admin account deleted.' : 'Student deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that account.');
    }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (u) => <span className="font-medium text-ink-800 block max-w-[180px] truncate" title={`${u.first_name} ${u.last_name}`}>{u.first_name} {u.last_name}</span> },
    { key: 'email', label: 'Email', render: (u) => <span className="text-ink-500 block max-w-[200px] truncate" title={u.email}>{u.email}</span> },
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
      // Separate from account Status (active/inactive) — a student can be
      // active but still not have clicked their verification link yet.
      key: 'verification',
      label: 'Verification',
      render: (u) => (
        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${u.email_verified_at ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
          {u.email_verified_at ? 'Verified' : 'Pending verification'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (u) => {
        const isSelf = Number(u.id) === Number(currentUser?.id);
        return (
          <ActionMenu
            label={`Actions for ${u.first_name} ${u.last_name}`}
            items={[
              { label: 'View Profile', icon: <Eye size={14} />, onClick: () => setSelectedUserId(u.id) },
              isSelf
                ? null
                : { label: u.is_active ? 'Deactivate' : 'Reactivate', icon: u.is_active ? <UserX size={14} /> : <UserCheck size={14} />, onClick: () => toggleActive(u) },
              u.role === 'student' ? { label: 'Reset Progress', icon: <RotateCcw size={14} />, onClick: () => handleReset(u) } : null,
              u.role === 'student' ? { label: 'Promote to Admin', icon: <ShieldCheck size={14} />, onClick: () => handlePromote(u) } : null,
              isSelf
                ? null
                : { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(u) },
            ].filter(Boolean)}
          />
        );
      },
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or student number..." className="flex-1" />
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-400">Role</span>
            <div className="flex gap-2 flex-wrap">
              {ROLE_FILTERS.map((f) => (
                <button key={f.id} onClick={() => setRole(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${role === f.id ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-400">Status</span>
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <button key={f.id} onClick={() => setStatus(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${status === f.id ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-400">Verification</span>
            <div className="flex gap-2 flex-wrap">
              {VERIFICATION_FILTERS.map((f) => (
                <button key={f.id} onClick={() => setVerification(f.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${verification === f.id ? 'bg-primary border-primary text-white' : 'bg-surface border-ink-100 text-ink-600 hover:border-primary-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-ink-100 bg-surface text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-primary-200 self-end">
            {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={users}
        loading={loading}
        error={error}
        onRetry={load}
        emptyState={{ icon: UsersIcon, title: 'No students found', message: 'Try a different search or filter.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {selectedUserId && <UserDetailDialog userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
