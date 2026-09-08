import { useState } from 'react';
import { Flame, Trophy } from 'lucide-react';
import Card, { CardHeader } from '../../../components/common/Card';
import EmptyState from '../../../components/common/EmptyState';
import LoadError from '../../../components/common/LoadError';
import ProgressBar from '../../../components/common/ProgressBar';
import { SkeletonGrid, SkeletonList } from '../../../components/common/Skeleton';
import AchievementBadge from '../../../components/student/gamification/AchievementBadge';
import { useAchievementsData, useGamificationSummary, useLeaderboardData } from '../../../hooks/useGamificationData';

const TABS = [
  { id: 'achievements', label: 'Achievements' },
  { id: 'leaderboard', label: 'Leaderboard' },
];

function XpHeader({ summary, loading }) {
  if (loading) {
    return <Card className="mb-5"><div className="h-16 animate-pulse rounded-xl bg-ink-100" /></Card>;
  }
  if (!summary) return null;

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-lg font-bold text-primary">
            {summary.level}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-800">Level {summary.level}</p>
            <p className="text-xs text-ink-400">{summary.xp} XP total</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-rose-600">
          <Flame size={16} />
          {summary.streak.current}-day streak
          <span className="text-xs font-medium text-ink-400">(best {summary.streak.best})</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={summary.progressPercent} className="flex-1" />
        <span className="whitespace-nowrap text-xs font-medium text-ink-400">
          {summary.xpIntoLevel} / {summary.xpForNextLevel} XP to Level {summary.level + 1}
        </span>
      </div>
    </Card>
  );
}

function AchievementsTab({ refreshKey, onRetry }) {
  const { data, loading, error } = useAchievementsData(refreshKey);

  if (loading) return <SkeletonGrid count={6} />;
  if (error || !data) {
    return (
      <LoadError
        title="Couldn't load your achievements"
        message={error?.message || 'Please try again in a moment.'}
        onRetry={onRetry}
      />
    );
  }

  const earned = data.earned ?? [];
  const locked = data.locked ?? [];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-500">
        <strong className="text-ink-800">{data.earnedCount}</strong> of {data.totalCount} unlocked
      </p>

      {earned.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Earned</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {earned.map((a) => (
              <AchievementBadge key={a.slug} achievement={a} earned earnedAt={a.earnedAt} />
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Locked</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {locked.map((a) => (
              <AchievementBadge key={a.slug} achievement={a} />
            ))}
          </div>
        </div>
      )}

      {earned.length === 0 && locked.length === 0 && (
        <EmptyState icon={Trophy} title="No achievements yet" message="Complete lessons and quizzes to start earning badges." />
      )}
    </div>
  );
}

function LeaderboardTab({ optedIn, onNavigate, refreshKey, onRetry }) {
  const [period, setPeriod] = useState('weekly');
  const { data, loading, error } = useLeaderboardData(period, refreshKey);

  return (
    <Card padded>
      <CardHeader
        title="Leaderboard"
        action={
          <div className="flex overflow-hidden rounded-lg border border-ink-100 text-xs font-semibold" role="group" aria-label="Leaderboard period">
            {[['weekly', 'This week'], ['all_time', 'All time']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className={period === value ? 'bg-primary px-3 py-1.5 text-white' : 'px-3 py-1.5 text-ink-500 hover:bg-ink-50'}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {!optedIn && (
        <div className="mb-4 rounded-xl border border-dashed border-ink-100 bg-ink-50/50 p-3 text-xs text-ink-500">
          You're not on the leaderboard yet. Turn on{' '}
          <button onClick={() => onNavigate('profile')} className="font-semibold text-primary hover:underline">
            &ldquo;Show me on the leaderboard&rdquo;
          </button>{' '}
          in your profile to appear here.
        </div>
      )}

      {loading ? (
        <SkeletonList count={5} />
      ) : error ? (
        <LoadError bare title="Couldn't load the leaderboard" message={error.message || 'Please try again in a moment.'} onRetry={onRetry} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No one on the board yet" message="Students who opt in and earn XP this period will show up here." />
      ) : (
        <ol className="flex flex-col divide-y divide-ink-50">
          {data.entries.map((entry) => {
            const isMe = data.me && data.me.rank === entry.rank && data.me.xp === entry.xp;
            return (
              <li
                key={`${entry.rank}-${entry.displayName}`}
                className={['flex items-center gap-3 py-2.5', isMe ? '-mx-2 rounded-lg bg-primary-50 px-2' : ''].join(' ')}
              >
                <span className="w-6 text-center text-sm font-bold text-ink-400">{entry.rank}</span>
                <span className="flex-1 truncate text-sm font-medium text-ink-800">
                  {entry.displayName}
                  {isMe && <span className="ml-1.5 text-[0.7rem] font-semibold text-primary">You</span>}
                </span>
                <span className="text-xs text-ink-400">Lvl {entry.level}</span>
                <span className="w-16 text-right text-sm font-semibold text-primary">{entry.xp} XP</span>
              </li>
            );
          })}
        </ol>
      )}

      {data && data.me && !data.entries.some((e) => data.me.rank === e.rank && data.me.xp === e.xp) && (
        <p className="mt-3 border-t border-ink-50 pt-3 text-xs text-ink-500">
          Your rank: <strong className="text-ink-800">#{data.me.rank}</strong> &middot; {data.me.xp} XP
        </p>
      )}
    </Card>
  );
}

export default function AchievementsPage({ onNavigate }) {
  const [tab, setTab] = useState('achievements');
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = () => setRefreshKey((k) => k + 1);
  const { data: summary, loading: summaryLoading } = useGamificationSummary(refreshKey);

  return (
    <div className="mx-auto max-w-4xl animate-fadeUp p-5 lg:p-8">
      <XpHeader summary={summary} loading={summaryLoading} />

      <div className="mb-5 flex gap-1 border-b border-ink-100" role="tablist" aria-label="Achievements and leaderboard">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-ink-400 hover:text-ink-600',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'achievements' ? (
        <AchievementsTab refreshKey={refreshKey} onRetry={retry} />
      ) : (
        <LeaderboardTab optedIn={Boolean(summary?.leaderboardOptIn)} onNavigate={onNavigate} refreshKey={refreshKey} onRetry={retry} />
      )}
    </div>
  );
}
