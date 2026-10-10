import { ACTIVITY_ICONS, ACTIVITY_ICON_FALLBACK } from '../../utils/activityIcons';
import { formatDateTime } from '../../utils/formatDate';
import { mergeActivityXp } from '../../utils/mergeActivityXp';
import XpPill from '../common/XpPill';

// Shared "list of recent activity rows" used by the Dashboard's Recent
// activity card and the Profile page's Activity history card — same data
// shape, same row design, so this was duplicated between them before.
export default function ActivityList({ activities }) {
  const items = mergeActivityXp(activities);
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((activity) => {
        const Icon = ACTIVITY_ICONS[activity.activity_type] || ACTIVITY_ICON_FALLBACK;
        return (
          <div key={activity.id} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center text-ink-400 flex-shrink-0">
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-ink-800 leading-snug">{activity.description}</p>
                <XpPill amount={activity.xpAmount} className="mt-0.5" />
              </div>
              <span className="text-xs text-ink-400">{formatDateTime(activity.created_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
