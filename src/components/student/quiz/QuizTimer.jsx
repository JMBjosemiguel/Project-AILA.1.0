import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';

const WARNING_SECONDS = 60;

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Counts down from the server's remainingSeconds. The deadline is fixed from
// that value when the attempt opens (or reopens after a refresh), so the
// browser never adds time; onWarning fires once at 1 minute left and onExpire
// once at 0.
export default function QuizTimer({ remainingSeconds, onWarning, onExpire }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(remainingSeconds)));
  const handlersRef = useRef({ onWarning, onExpire });
  handlersRef.current = { onWarning, onExpire };

  useEffect(() => {
    const deadline = Date.now() + Math.max(0, remainingSeconds) * 1000;
    let warned = false;
    let expired = false;
    let intervalId = null;

    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(next);
      if (!warned && next > 0 && next <= WARNING_SECONDS) {
        warned = true;
        handlersRef.current.onWarning?.();
      }
      if (!expired && next === 0) {
        expired = true;
        clearInterval(intervalId);
        handlersRef.current.onExpire?.();
      }
    };

    intervalId = setInterval(tick, 500);
    tick();
    return () => clearInterval(intervalId);
  }, [remainingSeconds]);

  const warning = left <= WARNING_SECONDS;
  return (
    <div
      role="timer"
      aria-label={`Time left ${formatClock(left)}`}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums flex-shrink-0',
        warning ? 'bg-rose-50 text-rose-600' : 'bg-primary-50 text-primary',
      ].join(' ')}
    >
      <Timer size={13} />
      {formatClock(left)}
    </div>
  );
}
