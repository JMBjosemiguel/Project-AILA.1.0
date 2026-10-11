import { useEffect, useState } from 'react';
import {
  Send, Users, BookOpen, FolderOpen, MessageSquare, GraduationCap,
  ClipboardCheck, Star, Activity, UserPlus, Sparkles, Upload, Trash2, AlertTriangle,
  Clock, LifeBuoy,
} from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import StatCard from '../../../components/common/StatCard';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonStat, SkeletonList } from '../../../components/common/Skeleton';
import { useToast } from '../../../components/common/Toast';
import BarChart from '../../../components/analytics/BarChart';
import { getAdminDashboard, sendAnnouncement } from '../../../services/api/adminService';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STUDENTS_NEEDING_HELP_ANCHOR = 'students-needing-help';

// Opens the Users page with ?userId=<id> in the URL and triggers the
// router's own popstate listener so it picks up the new path — there is no
// shared navigate-with-params helper, so this mirrors the pushState/popstate
// pattern LessonReader already uses for its own history-aware state.
function goToUserDetail(userId) {
  window.history.pushState({}, '', `/admin/users?userId=${userId}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function scrollToStudentsNeedingHelp() {
  document.getElementById(STUDENTS_NEEDING_HELP_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Consecutive admin-audit "removed a <table>" rows by the same admin on the
// same table collapse into one row — e.g. 6 separate "removed a user" rows
// become a single "removed 6 users" row.
function collapseDeletions(deletions) {
  const sorted = [...deletions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const groups = [];
  for (const d of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.first_name === d.first_name && last.last_name === d.last_name && last.target_table === d.target_table) {
      last.count += 1;
      last.ids.push(d.id);
    } else {
      groups.push({ first_name: d.first_name, last_name: d.last_name, target_table: d.target_table, created_at: d.created_at, count: 1, ids: [d.id] });
    }
  }
  return groups.map((g) => ({
    key: `del-${g.ids.join('-')}`,
    icon: Trash2,
    color: '#EF4444',
    time: g.created_at,
    text: g.count === 1
      ? `${g.first_name} ${g.last_name} removed a ${g.target_table.slice(0, -1)}`
      : `${g.first_name} ${g.last_name} removed ${g.count} ${g.target_table}`,
  }));
}

function AttentionItem({ icon: Icon, label, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-[180px] flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-left transition-colors hover:border-amber-200"
    >
      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-display font-bold leading-none text-ink-800">{value}</div>
        <div className="text-xs font-medium mt-0.5 text-ink-500">{label}</div>
      </div>
    </button>
  );
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ActivityRow({ icon: Icon, color, text, time }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1A`, color }}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-700 leading-snug">{text}</p>
        <span className="text-xs text-ink-400">{time}</span>
      </div>
    </div>
  );
}

export default function AdminDashboardPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const loadStats = () => {
    setLoading(true);
    setError(null);
    getAdminDashboard()
      .then(setStats)
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(loadStats, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      const result = await sendAnnouncement(title.trim(), body.trim());
      toast.success(`Sent to ${result.notified} student${result.notified === 1 ? '' : 's'}.`);
      setTitle('');
      setBody('');
    } catch (error) {
      toast.error(error.message || 'Could not send that announcement.');
    } finally {
      setSending(false);
    }
  };

  const cards = [
    { label: 'Total Students', value: stats?.totalStudents, icon: Users },
    { label: 'Total Courses', value: stats?.totalCourses, icon: BookOpen },
    { label: 'Total Resources', value: stats?.totalResources, icon: FolderOpen },
    { label: 'AI Conversations', value: stats?.totalConversations, icon: MessageSquare },
    { label: 'Total Lessons', value: stats?.totalLessons, icon: GraduationCap },
    { label: 'Quiz Attempts', value: stats?.totalQuizAttempts, icon: ClipboardCheck },
    { label: 'Total Feedback', value: stats?.totalFeedback, icon: Star },
    { label: 'Active Today', value: stats?.activeUsersToday, icon: Activity },
  ];

  const activity = stats?.recentActivity;
  const feedRows = activity ? [
    ...activity.registrations.map((r) => ({ key: `reg-${r.id}`, icon: UserPlus, color: '#2563EB', time: r.created_at, text: `${r.first_name} ${r.last_name} registered` })),
    ...activity.courses.map((c) => ({ key: `course-${c.id}`, icon: Sparkles, color: '#7C3AED', time: c.created_at, text: `${c.first_name || 'A student'} generated "${c.name}"` })),
    ...activity.uploads.map((u) => ({ key: `up-${u.id}`, icon: Upload, color: '#059669', time: u.created_at, text: `${u.first_name || 'A student'} uploaded "${u.title}"` })),
    ...activity.quizCompletions.map((q) => ({ key: `qz-${q.id}`, icon: ClipboardCheck, color: '#D97706', time: q.completed_at, text: `${q.first_name} completed quiz "${q.topic}" (${q.score}/${q.total})` })),
    ...activity.feedback.map((f) => ({ key: `fb-${f.id}`, icon: Star, color: '#DB2777', time: f.created_at, text: `${f.first_name} gave ${f.rating ? `${f.rating}-star ` : ''}feedback` })),
    ...collapseDeletions(activity.deletions),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 12) : [];

  const needsAttention = stats?.needsAttention;
  const activeStudentsChartData = (stats?.activeStudentsByDay ?? []).map((d) => ({
    day: WEEKDAY_LABELS[new Date(`${d.date}T00:00:00Z`).getUTCDay()],
    hours: d.count,
  }));

  return (
    <div className="p-5 lg:p-8 max-w-6xl 2xl:max-w-7xl mx-auto animate-fadeUp">
      {error && !loading && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Couldn&apos;t load the dashboard</p>
            <p className="text-xs text-rose-600 mt-0.5">{error.message || 'Please try again in a moment.'}</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadStats}>Retry</Button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 8 }).map((_, index) => <SkeletonStat key={index} />)
        ) : (
          cards.map((card) => <StatCard key={card.label} label={card.label} value={String(card.value ?? 0)} icon={card.icon} />)
        )}
      </div>

      {!loading && needsAttention && (
        <div className="flex flex-wrap gap-3 mb-5">
          <AttentionItem
            icon={MessageSquare}
            label="Feedback awaiting reply"
            value={needsAttention.feedbackPending}
            onClick={() => onNavigate('feedback')}
          />
          <AttentionItem
            icon={Clock}
            label="Unverified 24h+"
            value={needsAttention.unverifiedOver24h}
            onClick={() => onNavigate('users')}
          />
          <AttentionItem
            icon={LifeBuoy}
            label="Students who may need help"
            value={needsAttention.studentsNeedingHelp}
            onClick={scrollToStudentsNeedingHelp}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" subtitle="Live feed across every student." />
          {loading ? (
            <SkeletonList count={5} />
          ) : feedRows.length ? (
            <div className="flex flex-col divide-y divide-ink-50">
              {feedRows.map((row) => (
                <ActivityRow key={row.key} icon={row.icon} color={row.color} text={row.text} time={timeAgo(row.time)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Activity} title="No activity yet" message="Student activity will show up here as AILA is used." />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Feedback overview" subtitle="Average rating across all student feedback." />
            {loading ? (
              <SkeletonList count={1} />
            ) : stats?.totalFeedback ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-display font-extrabold text-ink-800">{stats.avgFeedbackRating}</span>
                <span className="text-ink-400">/ 5.0</span>
                <span className="text-xs text-ink-400 ml-2">({stats.totalFeedback} response{stats.totalFeedback === 1 ? '' : 's'})</span>
              </div>
            ) : (
              <EmptyState title="No feedback yet" message="Ratings will appear here once students respond." />
            )}
          </Card>

          <Card>
            <CardHeader title="Send an announcement" subtitle="Broadcast a notification to every active student." />
            <div className="flex flex-col gap-2.5">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Message"
                rows={3}
                className="border border-ink-100 focus:border-primary-300 rounded-lg px-3 py-2 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-primary-200"
              />
              <Button size="sm" icon={<Send size={14} />} onClick={handleSend} disabled={sending} className="self-start">
                {sending ? 'Sending...' : 'Send to all students'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div id={STUDENTS_NEEDING_HELP_ANCHOR} className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Students who may need help" subtitle="Active, verified students with no recent activity or a weak quiz average." />
          {loading ? (
            <SkeletonList count={3} />
          ) : stats?.studentsNeedingHelp?.length ? (
            <div className="flex flex-col divide-y divide-ink-50">
              {stats.studentsNeedingHelp.map((student) => (
                <div key={student.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-700 truncate">{student.first_name} {student.last_name}</p>
                    <p className="text-xs text-ink-400">{student.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToUserDetail(student.id)}
                    className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={LifeBuoy} title="Everyone's doing fine" message="Students with no recent activity or a weak quiz average will show up here." />
          )}
        </Card>

        <Card>
          <CardHeader title="Active students" subtitle="Distinct students active per day, last 7 days." />
          {loading ? (
            <SkeletonList count={1} />
          ) : activeStudentsChartData.some((d) => d.hours > 0) ? (
            <BarChart data={activeStudentsChartData} unit="" />
          ) : (
            <EmptyState title="No active students yet" message="Daily active students will appear here." />
          )}
        </Card>
      </div>
    </div>
  );
}
