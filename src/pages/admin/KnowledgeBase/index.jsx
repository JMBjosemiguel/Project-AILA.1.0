import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, BookOpen, Info, Trash2 } from 'lucide-react';
import ActionMenu from '../../../components/common/ActionMenu';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import DataTable from '../../../components/admin/DataTable';
import Pagination from '../../../components/admin/Pagination';
import SearchBar from '../../../components/admin/SearchBar';
import CourseDetailDialog from '../../../components/admin/CourseDetailDialog';
import {
  listAdminCourses, deleteAdminCourse, archiveAdminCourse, unarchiveAdminCourse,
} from '../../../services/api/adminService';

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
];

const ARCHIVED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

export default function AdminKnowledgeBasePage() {
  const [courses, setCourses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = () => {
    setLoading(true);
    listAdminCourses({ search, archived, sort, page, pageSize: 10 })
      .then((result) => { setCourses(result.courses ?? []); setPagination(result.pagination); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, archived, sort, page]);
  useEffect(() => { setPage(1); }, [search, archived, sort]);

  const handleDelete = async (course) => {
    const ok = await confirm({
      title: 'Delete this course?',
      message: `"${course.name}" and all of its modules, topics, and lessons will be permanently removed for ${course.first_name} ${course.last_name}.`,
    });
    if (!ok) return;
    try {
      await deleteAdminCourse(course.id);
      toast.success('Course deleted.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not delete that course.');
    }
  };

  const handleArchiveToggle = async (course) => {
    try {
      if (course.is_archived) await unarchiveAdminCourse(course.id);
      else await archiveAdminCourse(course.id);
      toast.success(course.is_archived ? 'Course unarchived.' : 'Course archived.');
      load();
    } catch (error) {
      toast.error(error.message || 'Could not update that course.');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Course',
      render: (c) => (
        <span className="font-medium text-ink-800">
          {c.name}
          {c.is_archived ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-400">Archived</span> : ''}
          {c.is_ai_generated ? <span className="ml-2 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded-full bg-primary-50 text-primary">AI</span> : ''}
        </span>
      ),
    },
    { key: 'owner', label: 'Owner', render: (c) => <span className="text-ink-500">{c.first_name} {c.last_name}</span> },
    { key: 'modules', label: 'Modules', render: (c) => <span className="text-ink-500">{c.module_count}</span> },
    { key: 'lessons', label: 'Lessons', render: (c) => <span className="text-ink-500">{c.lesson_count}</span> },
    { key: 'completion', label: 'Completion', render: (c) => <span className="text-ink-500">{c.completion_rate !== null ? `${c.completion_rate}%` : '—'}</span> },
    { key: 'quiz', label: 'Avg Quiz', render: (c) => <span className="text-ink-500">{c.avg_quiz_score !== null ? `${c.avg_quiz_score}%` : '—'}</span> },
    { key: 'created', label: 'Generated', render: (c) => <span className="text-ink-500">{new Date(c.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: 'View Course', icon: <Info size={14} />, onClick: () => setSelectedCourseId(c.id) },
            c.is_archived
              ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onClick: () => handleArchiveToggle(c) }
              : { label: 'Archive', icon: <Archive size={14} />, onClick: () => handleArchiveToggle(c) },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by course or owner..." className="flex-1" />
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

      <DataTable
        columns={columns}
        rows={courses}
        loading={loading}
        emptyState={{ icon: BookOpen, title: 'No courses found', message: 'Try a different search or filter.' }}
        footer={<Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={setPage} />}
      />

      {selectedCourseId && <CourseDetailDialog courseId={selectedCourseId} onClose={() => setSelectedCourseId(null)} />}
    </div>
  );
}
