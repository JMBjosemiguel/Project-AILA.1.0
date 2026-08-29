import { Sparkles, BookOpen, FolderOpen, BarChart3 } from 'lucide-react';
import Card, { CardHeader } from '../../common/Card';

const ACTIONS = [
  { id: 'assistant', label: 'Ask AILA', icon: Sparkles },
  { id: 'hub', label: 'Learning Hub', icon: BookOpen },
  { id: 'resources', label: 'Resources', icon: FolderOpen },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function QuickActionsCard({ onNavigate }) {
  return (
    <Card>
      <CardHeader title="Quick actions" />
      <div className="grid grid-cols-2 gap-2.5">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-xl border border-ink-100 bg-ink-50/60 hover:border-primary-300 hover:bg-primary-50 hover:text-primary text-ink-600 transition-colors"
          >
            <Icon size={18} />
            <span className="text-xs font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
