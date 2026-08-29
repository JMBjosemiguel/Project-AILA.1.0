import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Loader2, MessageSquare, X } from 'lucide-react';
import { getAdminUserDetail } from '../../services/api/adminService';
import { SkeletonList } from '../common/Skeleton';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Stat({ label, value }) {
  return (
    <div className="bg-ink-50/60 rounded-xl p-3">
      <div className="text-lg font-display font-bold text-ink-800">{value}</div>
      <div className="text-xs text-ink-400">{label}</div>
    </div>
  );
}

export default function UserDetailDialog({ userId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAdminUserDetail(userId)
      .then((result) => { if (active) setDetail(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="user-detail-title">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div>
            <h3 id="user-detail-title" className="text-[0.95rem] font-semibold text-ink-800">
              {loading ? 'Loading student...' : `${detail?.first_name} ${detail?.last_name}`}
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">{detail?.email}</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-400 py-10 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading student profile...
            </div>
          ) : detail ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Stat label="Courses generated" value={detail.coursesGenerated} />
                <Stat label="Lessons completed" value={detail.lessonsCompleted} />
                <Stat label="Resources uploaded" value={detail.resourcesUploaded} />
                <Stat label="Quiz average" value={detail.quizAverage !== null ? `${detail.quizAverage}%` : '—'} />
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <div className="flex items-center gap-2 text-ink-600">
                  <Flame size={14} className="text-amber-500" />
                  {detail.streak.current_streak}-day streak (longest {detail.streak.longest_streak})
                </div>
                <div className="text-ink-500">Storage used: {formatBytes(detail.storageBytes)}</div>
                <div className="text-ink-500">Program: {detail.program || 'Not set'} {detail.year_level ? `· Yr ${detail.year_level}` : ''}</div>
                <div className="text-ink-500">Joined: {new Date(detail.created_at).toLocaleDateString()}</div>
                <div className="text-ink-500 col-span-2">Last login: {detail.last_login_at ? new Date(detail.last_login_at).toLocaleString() : 'Never'}</div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2">Recent activity</div>
                {detail.recentActivity?.length ? (
                  <div className="flex flex-col divide-y divide-ink-50">
                    {detail.recentActivity.map((item) => (
                      <div key={item.id} className="py-2 text-sm text-ink-600">
                        {item.description}
                        <span className="block text-xs text-ink-300">{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-ink-400">No recent activity.</p>}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-400 mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent AI conversations
                </div>
                {detail.recentConversations?.length ? (
                  <div className="flex flex-col divide-y divide-ink-50">
                    {detail.recentConversations.map((item) => (
                      <div key={item.id} className="py-2 text-sm text-ink-600 flex items-center justify-between">
                        <span className="truncate">{item.title || 'Untitled conversation'}</span>
                        <span className="text-xs text-ink-300 flex-shrink-0 ml-2">{item.message_count} msgs</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-ink-400">No conversations yet.</p>}
              </div>
            </div>
          ) : (
            <SkeletonList count={4} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
