import { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonList } from '../../../components/common/Skeleton';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import TaskItem from '../../../components/student/planner/TaskItem';
import { TASK_STATUS } from '../../../constants/ui';
import { usePlannerData } from '../../../hooks/usePlannerData';
import { useLearningHubData } from '../../../hooks/useLearningHubData';
import { createStudyTask, deleteStudyTask, duplicateStudyTask, updateStudyTask } from '../../../services/api/plannerService';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: "Today" },
  { id: 'week', label: 'This Week' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COLORS = ['#2563EB', '#7C3AED', '#059669', '#DB2777', '#D97706', '#0891B2'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const REPEAT_OPTIONS = ['none', 'daily', 'weekly'];

const DEFAULT_DETAILS = {
  deadline: '',
  subject_id: '',
  priority_id: '2',
  difficulty: '',
  estimated_minutes: '',
  color: '',
  notes: '',
  repeat_interval: 'none',
  remind_me: false,
};

function toLocalInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function PlannerPage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading } = usePlannerData(refreshVersion);
  const { data: hubData } = useLearningHubData();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [filter, setFilter] = useState('all');
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState(DEFAULT_DETAILS);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const subjects = hubData?.subjects ?? [];
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    setTasks(data?.tasks ?? []);
  }, [data]);

  const toggle = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const nextStatus = task.status === TASK_STATUS.COMPLETED ? TASK_STATUS.PENDING : TASK_STATUS.COMPLETED;

    try {
      const updated = await updateStudyTask(id, { status: nextStatus });
      setTasks((current) => current.map((item) => (item.id === id ? updated : item)));
      toast.success(nextStatus === TASK_STATUS.COMPLETED ? 'Task marked complete.' : 'Task marked incomplete.');
    } catch (error) {
      toast.error(error.message || 'Could not update that task.');
    }
  };

  const handleDelete = async (id) => {
    const task = tasks.find((item) => item.id === id);
    const ok = await confirm({
      title: 'Delete this task?',
      message: task ? `"${task.title}" will be permanently removed.` : 'This task will be permanently removed.',
    });
    if (!ok) return;

    try {
      await deleteStudyTask(id);
      setTasks((current) => current.filter((item) => item.id !== id));
      toast.success('Task deleted.');
    } catch (error) {
      toast.error(error.message || 'Could not delete that task.');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const duplicated = await duplicateStudyTask(id);
      setTasks((current) => [duplicated, ...current]);
      toast.success('Task duplicated.');
    } catch (error) {
      toast.error(error.message || 'Could not duplicate that task.');
    }
  };

  const startEdit = (task) => {
    setEditingTaskId(task.id);
    setNewTask(task.title);
    setDetails({
      deadline: toLocalInputValue(task.deadline),
      subject_id: task.subject_id ? String(task.subject_id) : '',
      priority_id: task.priority_id ? String(task.priority_id) : '2',
      difficulty: task.difficulty || '',
      estimated_minutes: task.estimated_minutes || '',
      color: task.color || '',
      notes: task.notes || '',
      repeat_interval: task.repeat_interval || 'none',
      remind_me: task.remind_me || false,
    });
    setShowDetails(true);
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setNewTask('');
    setDetails(DEFAULT_DETAILS);
    setShowDetails(false);
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const payload = {
      title: newTask.trim(),
      description: null,
      deadline: details.deadline || null,
      priority_id: details.priority_id || null,
      subject_id: details.subject_id || null,
      difficulty: details.difficulty || null,
      estimated_minutes: details.estimated_minutes || null,
      color: details.color || null,
      notes: details.notes || null,
      repeat_interval: details.repeat_interval || null,
      remind_me: details.remind_me,
    };

    try {
      if (editingTaskId) {
        const updated = await updateStudyTask(editingTaskId, payload);
        setTasks((current) => current.map((item) => (item.id === editingTaskId ? updated : item)));
        toast.success('Task updated.');
      } else {
        const created = await createStudyTask(payload);
        setTasks((current) => [created, ...current]);
        toast.success('Task created.');
      }
      cancelEdit();
    } catch (error) {
      toast.error(error.message || 'Could not save that task.');
    }
  };

  const filtered = tasks.filter((task) => {
    if (filter === 'today') return task.is_today && task.status !== TASK_STATUS.COMPLETED;
    if (filter === 'week') {
      if (task.is_overdue || task.status === TASK_STATUS.COMPLETED || !task.deadline) return false;
      return new Date(task.deadline).getTime() - Date.now() <= WEEK_MS;
    }
    if (filter === 'upcoming') return !task.is_overdue && !task.is_today && task.status !== TASK_STATUS.COMPLETED;
    if (filter === 'overdue') return task.is_overdue;
    if (filter === 'completed') return task.status === TASK_STATUS.COMPLETED;
    return true;
  });

  const pending = filtered.filter((task) => task.status !== TASK_STATUS.COMPLETED);
  const completed = filtered.filter((task) => task.status === TASK_STATUS.COMPLETED);

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto animate-fadeUp">
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Your tasks" subtitle={`${pending.length} pending - ${completed.length} completed`} />

          {editingTaskId && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-50 rounded-lg px-3 py-1.5 mb-2">
              Editing task
              <button onClick={cancelEdit} className="ml-auto flex items-center gap-1 text-ink-500 hover:text-ink-800">
                <X size={12} /> Cancel
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <label htmlFor="planner-new-task" className="sr-only">Task title</label>
            <input
              id="planner-new-task"
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addTask()}
              placeholder="Add a task..."
              className="flex-1 border border-ink-100 focus:border-primary-300 rounded-xl px-3.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            />
            <Button icon={<Plus size={15} />} onClick={addTask}>{editingTaskId ? 'Save' : 'Add'}</Button>
          </div>

          <button
            onClick={() => setShowDetails((current) => !current)}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600 mb-3"
          >
            {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            More details
          </button>

          {showDetails && (
            <div className="grid sm:grid-cols-2 gap-3 mb-4 p-3.5 bg-ink-50/60 rounded-xl">
              <div>
                <label htmlFor="task-subject" className="text-xs font-semibold text-ink-600 mb-1 block">Subject</label>
                <select
                  id="task-subject"
                  value={details.subject_id}
                  onChange={(event) => setDetails((current) => ({ ...current, subject_id: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-primary-200"
                >
                  <option value="">None</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="task-deadline" className="text-xs font-semibold text-ink-600 mb-1 block">Deadline</label>
                <input
                  id="task-deadline"
                  type="datetime-local"
                  value={details.deadline}
                  onChange={(event) => setDetails((current) => ({ ...current, deadline: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-primary-200"
                />
              </div>

              <div>
                <label htmlFor="task-priority" className="text-xs font-semibold text-ink-600 mb-1 block">Priority</label>
                <select
                  id="task-priority"
                  value={details.priority_id}
                  onChange={(event) => setDetails((current) => ({ ...current, priority_id: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-primary-200"
                >
                  {(data?.priorities ?? []).map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}
                </select>
              </div>

              <div>
                <span className="text-xs font-semibold text-ink-600 mb-1 block">Difficulty</span>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Difficulty">
                  {DIFFICULTIES.map((option) => (
                    <button
                      key={option}
                      onClick={() => setDetails((current) => ({ ...current, difficulty: current.difficulty === option ? '' : option }))}
                      role="radio"
                      aria-checked={details.difficulty === option}
                      className={[
                        'text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                        details.difficulty === option ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600',
                      ].join(' ')}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="task-duration" className="text-xs font-semibold text-ink-600 mb-1 block">Estimated duration (min)</label>
                <input
                  id="task-duration"
                  type="number"
                  min={1}
                  max={600}
                  value={details.estimated_minutes}
                  onChange={(event) => setDetails((current) => ({ ...current, estimated_minutes: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-primary-200"
                />
              </div>

              <div>
                <label htmlFor="task-repeat" className="text-xs font-semibold text-ink-600 mb-1 block">Repeat</label>
                <select
                  id="task-repeat"
                  value={details.repeat_interval}
                  onChange={(event) => setDetails((current) => ({ ...current, repeat_interval: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white capitalize focus-visible:ring-2 focus-visible:ring-primary-200"
                >
                  {REPEAT_OPTIONS.map((option) => <option key={option} value={option} className="capitalize">{option}</option>)}
                </select>
              </div>

              <div>
                <span className="text-xs font-semibold text-ink-600 mb-1 block">Color</span>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Color">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setDetails((current) => ({ ...current, color: current.color === color ? '' : color }))}
                      role="radio"
                      aria-checked={details.color === color}
                      aria-label={`Color ${color}`}
                      className={`w-6 h-6 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${details.color === color ? 'border-ink-800' : 'border-transparent'}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  id="remind-me"
                  checked={details.remind_me}
                  onChange={(event) => setDetails((current) => ({ ...current, remind_me: event.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="remind-me" className="text-xs font-semibold text-ink-600">Remind me before deadline</label>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="task-notes" className="text-xs font-semibold text-ink-600 mb-1 block">Notes</label>
                <textarea
                  id="task-notes"
                  rows={2}
                  value={details.notes}
                  onChange={(event) => setDetails((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full border border-ink-100 rounded-lg px-2.5 py-1.5 text-sm outline-none bg-white resize-none focus-visible:ring-2 focus-visible:ring-primary-200"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-4">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className={[
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors',
                  filter === option.id ? 'bg-primary border-primary text-white' : 'bg-white border-ink-100 text-ink-600 hover:border-primary-300',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            {loading ? (
              <SkeletonList count={4} />
            ) : filtered.length ? (
              <>
                {pending.map((task) => (
                  <TaskItem key={task.id} task={task} onToggle={toggle} onDelete={handleDelete} onEdit={startEdit} onDuplicate={handleDuplicate} />
                ))}
                {completed.length > 0 && (
                  <>
                    <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mt-4 mb-1 px-0.5">Completed</div>
                    {completed.map((task) => (
                      <TaskItem key={task.id} task={task} onToggle={toggle} onDelete={handleDelete} onEdit={startEdit} onDuplicate={handleDuplicate} />
                    ))}
                  </>
                )}
              </>
            ) : tasks.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No study tasks" message="Create your first study plan." />
            ) : (
              <EmptyState title="No tasks match this filter" message="Try a different filter to see your tasks." />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Exam reminders" />
            <EmptyState title="No upcoming exams" message="Tasks marked High priority with a deadline will show up here as your exams approach." />
          </Card>

          <Card>
            <CardHeader title="This week" />
            <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold text-ink-400 mb-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(data?.calendarSummary ?? []).length ? data.calendarSummary.map((day) => (
                <div key={day.date} className="aspect-square rounded-lg bg-ink-50 flex items-center justify-center text-[0.65rem] font-bold text-ink-600">
                  {day.count || ''}
                </div>
              )) : Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="aspect-square rounded-lg bg-ink-50 flex items-center justify-center text-[0.65rem] font-bold text-ink-600" />
              ))}
            </div>
            <p className="text-xs text-ink-400 mt-3 leading-relaxed">Numbers show tasks due that day.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
