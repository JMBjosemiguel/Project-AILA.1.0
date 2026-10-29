import { AlertTriangle } from 'lucide-react';

const HIGH_TAB_SWITCHES = 5;

// How often the student left a quiz (tab hidden or window blurred): plain
// gray at 0, amber for 1-4, red for 5 or more.
export default function TabSwitchBadge({ count }) {
  const n = Number(count) || 0;
  if (n === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-ink-50 px-2 py-0.5 text-[0.7rem] font-medium text-ink-400 whitespace-nowrap">
        No tab switches
      </span>
    );
  }
  const high = n >= HIGH_TAB_SWITCHES;
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap',
        high ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700',
      ].join(' ')}
      data-level={high ? 'high' : 'some'}
    >
      <AlertTriangle size={11} aria-hidden="true" />
      {n} tab switch{n === 1 ? '' : 'es'}
    </span>
  );
}
