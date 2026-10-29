import { useEffect, useState } from 'react';
import { ArrowRight, PlayCircle, Timer } from 'lucide-react';
import Card, { CardHeader } from '../../common/Card';
import Button from '../../common/Button';
import { formatClock } from '../quiz/QuizTimer';

const KIND_PREFIX = {
  module_checkpoint: 'Module Checkpoint',
  course_final: 'Course Final',
};

function attemptLabel(attempt) {
  const prefix = KIND_PREFIX[attempt.assessmentKind];
  return prefix ? `${prefix} — ${attempt.topic || 'Assessment'}` : (attempt.topic || 'Quiz');
}

// Seconds left on a timed attempt, counting down from the server's
// remainingSeconds (the deadline is fixed when the list loads, like
// QuizTimer). null for an untimed attempt.
function useSecondsLeft(remainingSeconds) {
  const timed = remainingSeconds != null;
  const [left, setLeft] = useState(() => (timed ? Math.max(0, Math.ceil(remainingSeconds)) : null));

  useEffect(() => {
    if (!timed) {
      setLeft(null);
      return undefined;
    }
    const deadline = Date.now() + Math.max(0, remainingSeconds) * 1000;
    let intervalId = null;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) clearInterval(intervalId);
    };
    intervalId = setInterval(tick, 1000);
    tick();
    return () => clearInterval(intervalId);
  }, [timed, remainingSeconds]);

  return left;
}

function ResumeRow({ attempt, onResume }) {
  const total = attempt.total || 0;
  const answered = attempt.answered || 0;
  const pct = attempt.progressPercent ?? (total ? Math.round((answered / total) * 100) : 0);
  const secondsLeft = useSecondsLeft(attempt.expired ? null : attempt.remainingSeconds);
  const expired = attempt.expired || secondsLeft === 0;

  return (
    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-800 truncate">{attemptLabel(attempt)}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-1.5 flex-1 bg-ink-100 rounded-full overflow-hidden max-w-[180px]">
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
          <span className="text-[0.7rem] text-ink-400 font-semibold whitespace-nowrap">{answered}/{total} answered</span>
          {secondsLeft != null && secondsLeft > 0 && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold tabular-nums whitespace-nowrap text-primary">
              <Timer size={12} aria-hidden="true" />
              {formatClock(secondsLeft)} left
            </span>
          )}
        </div>
      </div>
      <Button
        size="sm"
        icon={<ArrowRight size={14} />}
        onClick={() => onResume(attempt)}
      >
        {expired ? "Time's up, see results" : 'Resume'}
      </Button>
    </div>
  );
}

// Shown only when the student has an unfinished formal quiz attempt. The real
// progress lives on the server; this is just the way back into it. A timed
// attempt shows its time left, live; once its time runs out it is submitted
// when opened, so its button says so.
export default function ResumeTestCard({ attempts = [], onResume }) {
  if (!attempts.length) return null;

  return (
    <Card className="mb-5 border-primary-100">
      <CardHeader
        title="Resume a test"
        subtitle={attempts.length === 1 ? 'You have an unfinished quiz.' : `You have ${attempts.length} unfinished quizzes.`}
        action={<PlayCircle size={18} className="text-primary" />}
      />
      <div className="flex flex-col gap-3">
        {attempts.map((attempt) => (
          <ResumeRow key={attempt.attemptId} attempt={attempt} onResume={onResume} />
        ))}
      </div>
    </Card>
  );
}
