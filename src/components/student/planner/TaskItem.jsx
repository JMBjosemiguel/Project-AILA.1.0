import { AlertCircle, Bell, Check, Copy, Pencil, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { TASK_STATUS } from '../../../constants/ui';
import ActionMenu from '../../common/ActionMenu';

const PRIORITY_STYLE = {
  high: 'bg-rose-50 text-rose-600',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-ink-50 text-ink-400',
};

export default function TaskItem({ task, onToggle, onDelete, onEdit, onDuplicate }) {
  const isDone = task.status === TASK_STATUS.COMPLETED;
  const priority = task.priority?.label?.toLowerCase() ?? task.priority_label?.toLowerCase() ?? 'low';

  const menuItems = [
    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => onEdit?.(task) },
    { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => onDuplicate?.(task.id) },
    isDone
      ? { label: 'Undo complete', icon: <RotateCcw size={14} />, onClick: () => onToggle(task.id) }
      : { label: 'Mark complete', icon: <Check size={14} />, onClick: () => onToggle(task.id) },
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete?.(task.id) },
  ];

  return (
    <div
      className="group flex items-center gap-3 py-3 border-b border-ink-50 last:border-0 pl-2.5 -ml-2.5"
      style={task.color ? { borderLeft: `3px solid ${task.color}` } : undefined}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label={isDone ? 'Mark task incomplete' : 'Mark task complete'}
        className={[
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
          isDone ? 'bg-primary border-primary' : 'border-ink-200 hover:border-primary',
        ].join(' ')}
      >
        {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${isDone ? 'text-ink-300 line-through' : 'text-ink-800'}`}>{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs ${task.is_overdue ? 'text-rose-500 font-semibold' : 'text-ink-400'}`}>
            Due {task.deadline ? new Date(task.deadline).toLocaleString() : 'not scheduled'}
          </span>
          {task.subject_name && <span className="text-xs text-ink-300">- {task.subject_name}</span>}
          {task.repeat_interval && task.repeat_interval !== 'none' && <Repeat size={11} className="text-ink-300" />}
          {task.remind_me && <Bell size={11} className="text-ink-300" />}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {task.is_overdue && (
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">
            <AlertCircle size={11} /> Overdue
          </span>
        )}
        {task.difficulty && (
          <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize bg-ink-50 text-ink-500">
            {task.difficulty}
          </span>
        )}
        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.low}`}>
          {priority}
        </span>
      </div>
      <ActionMenu items={menuItems} label={`Actions for ${task.title}`} />
    </div>
  );
}
