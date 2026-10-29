import Card, { CardHeader } from '../common/Card';
import EmptyState from '../common/EmptyState';

function weekLabel(iso, timezone) {
  const options = { month: 'short', day: 'numeric' };
  try {
    return new Date(iso).toLocaleDateString('en-US', { ...options, timeZone: timezone || undefined });
  } catch {
    return new Date(iso).toLocaleDateString('en-US', options);
  }
}

const COLUMNS = [
  { key: 'activeStudents', label: 'Active students' },
  { key: 'quizzesCompleted', label: 'Quizzes completed' },
  { key: 'avgQuizScore', label: 'Avg quiz score', format: (v) => (v == null ? '—' : `${v}%`) },
  { key: 'lessonsCompleted', label: 'Lessons completed' },
  { key: 'newRegistrations', label: 'New registrations' },
];

// Whole-platform results for the last 8 weeks (server: adminAnalyticsModel
// getWeeklyResults). Weeks start Monday 00:00 in the app timezone, like the
// weekly leaderboard; the server sends them oldest first, shown newest first.
export default function WeeklyResults({ weeks = [], timezone }) {
  const rows = [...weeks].reverse();

  return (
    <Card>
      <CardHeader
        title="Weekly results"
        subtitle={`Last 8 weeks, weeks start Monday${timezone ? ` (${timezone})` : ''} · chat quizzes not included`}
      />
      {rows.length ? (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] font-bold uppercase tracking-wider text-ink-400">
                <th scope="col" className="py-2 px-1 font-bold">Week of</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className="py-2 px-1 text-right font-bold">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((week, index) => (
                <tr key={week.weekStart}>
                  <th scope="row" className="py-2 px-1 text-left font-medium text-ink-700 whitespace-nowrap">
                    {weekLabel(week.weekStart, timezone)}
                    {index === 0 && <span className="text-xs font-normal text-ink-400"> (this week)</span>}
                  </th>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="py-2 px-1 text-right tabular-nums text-ink-700">
                      {col.format ? col.format(week[col.key]) : week[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No weekly results yet" message="Weekly totals will appear here as students use AILA." />
      )}
    </Card>
  );
}
