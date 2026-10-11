import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import Card, { CardHeader } from '../common/Card';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import ProgressBar from '../common/ProgressBar';
import { SkeletonList } from '../common/Skeleton';
import { getAdminTopicGroups, regroupAdminTopicGroups } from '../../services/api/adminService';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Same threshold everywhere a group/topic average is shown — colored by its
// own value, not by which list (Strongest/Weakest) it happens to be in.
function pctTextColor(pct) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-rose-600';
}
function pctFillColor(pct) {
  if (pct >= 80) return '#059669';
  if (pct >= 50) return '#D97706';
  return '#E11D48';
}

function GroupRow({ group, onClick }) {
  return (
    <button
      onClick={() => onClick(group)}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-sm text-left hover:bg-ink-50/60 -mx-2 px-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
    >
      <div className="min-w-0">
        <span className="text-ink-700 font-medium truncate block">{group.name}</span>
        <span className="text-xs text-ink-400">{group.topicCount} topic{group.topicCount === 1 ? '' : 's'} · {group.studentCount} student{group.studentCount === 1 ? '' : 's'}</span>
      </div>
      <span className={`font-semibold flex-shrink-0 ml-2 ${pctTextColor(group.avgPct)}`}>{group.avgPct}%</span>
    </button>
  );
}

function DialogShell({ titleId, title, subtitle, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-ink-900/50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-surface border border-ink-100 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0 border-b border-ink-100">
          <div className="min-w-0">
            <h3 id={titleId} className="text-[0.95rem] font-semibold text-ink-800 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function GroupDetailDialog({ group, onClose }) {
  return (
    <DialogShell
      titleId="topic-group-detail-title"
      title={group.name}
      subtitle={`${group.topicCount} topic${group.topicCount === 1 ? '' : 's'} · ${group.studentCount} student${group.studentCount === 1 ? '' : 's'} · ${group.avgPct}% average`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {group.topics.map((topic) => (
          <div key={topic.id}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-800 truncate">{topic.title}</p>
                <p className="text-xs text-ink-400">{topic.courseName} · {topic.studentCount} student{topic.studentCount === 1 ? '' : 's'}</p>
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ${pctTextColor(topic.avgPct)}`}>{topic.avgPct}%</span>
            </div>
            <ProgressBar value={topic.avgPct} color={pctFillColor(topic.avgPct)} height={6} />
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

function AllGroupsDialog({ groups, onSelectGroup, onClose }) {
  const weakestFirst = [...groups].sort((a, b) => a.avgPct - b.avgPct);
  return (
    <DialogShell titleId="topic-groups-all-title" title="All topic groups" subtitle={`${groups.length} group${groups.length === 1 ? '' : 's'}, weakest first`} onClose={onClose}>
      <div className="flex flex-col divide-y divide-ink-50">
        {weakestFirst.map((group) => <GroupRow key={group.id} group={group} onClick={onSelectGroup} />)}
      </div>
    </DialogShell>
  );
}

export default function TopicGroupsSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [regrouping, setRegrouping] = useState(false);
  const [dialog, setDialog] = useState(null); // null | 'all' | { ...group }

  const load = () => {
    setLoading(true);
    setError(null);
    getAdminTopicGroups()
      .then(setData)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRegroup = async () => {
    setRegrouping(true);
    try {
      const result = await regroupAdminTopicGroups();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setRegrouping(false);
    }
  };

  const groupById = (id) => data?.groups.find((g) => g.id === id);
  const strongest = data ? data.strongestIds.map(groupById).filter(Boolean) : [];
  const weakest = data ? data.weakestIds.map(groupById).filter(Boolean) : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-50 px-2.5 py-1 rounded-full">
          <Sparkles size={12} /> Grouped by AILA
        </span>
        {data && <span className="text-xs text-ink-400">updated {timeAgo(data.generatedAt)}</span>}
        <div className="flex-1" />
        {data?.groups?.length > 0 && (
          <button onClick={() => setDialog('all')} className="text-xs font-semibold text-primary hover:underline">
            View all groups
          </button>
        )}
        <Button size="sm" variant="outline" icon={<RefreshCw size={13} className={regrouping ? 'animate-spin' : ''} />} onClick={handleRegroup} disabled={regrouping || loading}>
          {regrouping ? 'Regrouping...' : 'Regroup'}
        </Button>
      </div>

      {data && !data.aiGrouped && (
        <p className="text-xs text-ink-400 mb-3">Showing individual topics — AI grouping unavailable.</p>
      )}

      {error ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load topic groups"
            message={error?.message || 'Something went wrong. Please try again.'}
            action={<Button size="sm" variant="outline" onClick={load}>Retry</Button>}
          />
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Strongest topic groups" subtitle="Highest average progress across students" />
            {loading ? <SkeletonList count={4} /> : strongest.length ? (
              <div className="flex flex-col divide-y divide-ink-50">
                {strongest.map((group) => <GroupRow key={group.id} group={group} onClick={setDialog} />)}
              </div>
            ) : <EmptyState icon={TrendingUp} title="No topic progress yet" message="This will fill in as students use AILA." />}
          </Card>
          <Card>
            <CardHeader title="Weakest topic groups" subtitle="Lowest average progress across students" />
            {loading ? <SkeletonList count={4} /> : weakest.length ? (
              <div className="flex flex-col divide-y divide-ink-50">
                {weakest.map((group) => <GroupRow key={group.id} group={group} onClick={setDialog} />)}
              </div>
            ) : <EmptyState icon={TrendingDown} title={data?.groups?.length ? 'Nothing weak to show' : 'No topic progress yet'} message={data?.groups?.length ? 'Every group is fully mastered.' : 'This will fill in as students use AILA.'} />}
          </Card>
        </div>
      )}

      {dialog === 'all' && data && (
        <AllGroupsDialog groups={data.groups} onSelectGroup={setDialog} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog !== 'all' && (
        <GroupDetailDialog group={dialog} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
