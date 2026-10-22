import { useState } from 'react';
import { Eye } from 'lucide-react';
import { ACTIVITY_ICONS, ACTIVITY_ICON_FALLBACK } from '../../utils/activityIcons';
import { formatDateTime } from '../../utils/formatDate';
import { mergeActivityXp } from '../../utils/mergeActivityXp';
import { getAttemptIdForActivity } from '../../services/api/quizService';
import { useToast } from '../common/Toast';
import XpPill from '../common/XpPill';
import QuizRunner from './quiz/QuizRunner';

// Shared "list of recent activity rows" used by the Dashboard's Recent
// activity card and the Profile page's Activity history card — same data
// shape, same row design, so this was duplicated between them before.
// `showQuizView` is turned off by the admin UserDetailDialog, which renders
// another student's activity under the viewing admin's own session — the
// "View" button's resolve call is ownership-scoped to the caller, so it
// would always 404 there.
export default function ActivityList({ activities, showQuizView = true }) {
  const items = mergeActivityXp(activities);
  const [resolvingId, setResolvingId] = useState(null);
  const [reviewAttemptId, setReviewAttemptId] = useState(null);
  const toast = useToast();

  const handleView = async (activity) => {
    if (resolvingId) return;
    setResolvingId(activity.id);
    try {
      const { attemptId } = await getAttemptIdForActivity(activity.id);
      setReviewAttemptId(attemptId);
    } catch (err) {
      toast.error(err.message || 'This quiz is no longer available.');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {items.map((activity) => {
        const Icon = ACTIVITY_ICONS[activity.activity_type] || ACTIVITY_ICON_FALLBACK;
        const canView = showQuizView && activity.activity_type === 'quiz_completed';
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-400">{formatDateTime(activity.created_at)}</span>
                {canView && (
                  <button
                    type="button"
                    onClick={() => handleView(activity)}
                    disabled={resolvingId === activity.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-600 disabled:opacity-50 flex-shrink-0"
                  >
                    <Eye size={12} /> {resolvingId === activity.id ? 'Opening…' : 'View'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {reviewAttemptId && (
        <QuizRunner reviewAttemptId={reviewAttemptId} onClose={() => setReviewAttemptId(null)} />
      )}
    </div>
  );
}
