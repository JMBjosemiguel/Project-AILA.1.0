import { ArrowRight, PlayCircle } from 'lucide-react';
import Card, { CardHeader } from '../../common/Card';
import Button from '../../common/Button';

// Shown only when the student has an unfinished formal quiz attempt. The real
// progress lives on the server; this is just the way back into it.
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
        {attempts.map((attempt) => {
          const total = attempt.total || 0;
          const answered = attempt.answered || 0;
          const pct = attempt.progressPercent ?? (total ? Math.round((answered / total) * 100) : 0);

          return (
            <div key={attempt.attemptId} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-800 truncate">{attempt.topic || 'Quiz'}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="h-1.5 flex-1 bg-ink-100 rounded-full overflow-hidden max-w-[180px]">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                  </div>
                  <span className="text-[0.7rem] text-ink-400 font-semibold whitespace-nowrap">{answered}/{total} answered</span>
                </div>
              </div>
              <Button
                size="sm"
                icon={<ArrowRight size={14} />}
                onClick={() => onResume(attempt)}
              >
                Resume
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
