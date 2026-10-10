import { Activity, BookOpenCheck, CheckSquare, ClipboardCheck, FolderOpen, Zap } from 'lucide-react';

export const ACTIVITY_ICONS = {
  lesson_completed: BookOpenCheck,
  quiz_completed: ClipboardCheck,
  task_completed: CheckSquare,
  resource_viewed: FolderOpen,
  xp_earned: Zap,
};

export const ACTIVITY_ICON_FALLBACK = Activity;
