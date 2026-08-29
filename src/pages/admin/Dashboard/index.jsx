import { useEffect, useState } from 'react';
import {
  Send, Users, BookOpen, FolderOpen, MessageSquare, GraduationCap,
  ClipboardCheck, Star, Activity, UserPlus, Sparkles, Upload, Trash2,
} from 'lucide-react';
import Button from '../../../components/common/Button';
import Card, { CardHeader } from '../../../components/common/Card';
import StatCard from '../../../components/common/StatCard';
import EmptyState from '../../../components/common/EmptyState';
import { SkeletonStat, SkeletonList } from '../../../components/common/Skeleton';
import { useToast } from '../../../components/common/Toast';
import { getAdminDashboard, sendAnnouncement } from '../../../services/api/adminService';

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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getAdminDashboard()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

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
    ...activity.deletions.map((d) => ({ key: `del-${d.id}`, icon: Trash2, color: '#EF4444', time: d.created_at, text: `${d.first_name} ${d.last_name} removed a ${d.target_table.slice(0, -1)}` })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 12) : [];

  return (
    <div className="p-5 lg:p-8 max-w-6xl mx-auto animate-fadeUp">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {loading ? (
          Array.from({ length: 8 }).map((_, index) => <SkeletonStat key={index} />)
        ) : (
          cards.map((card) => <StatCard key={card.label} label={card.label} value={String(card.value ?? 0)} icon={card.icon} />)
        )}
      </div>

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
                <span className="text-xs text-ink-400 ml-2">({stats.totalFeedback} responses)</span>
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
    </div>
  );
}
