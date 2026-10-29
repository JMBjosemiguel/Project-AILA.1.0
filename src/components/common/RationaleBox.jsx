import { Lightbulb } from 'lucide-react';

// The labelled "Rationale" box under each question in a quiz review (student
// review, timed-out review, shared quiz). Always shown, for right and wrong
// answers alike; says so plainly when a question was saved without one.
export default function RationaleBox({ explanation }) {
  const text = (explanation ?? '').toString().trim();
  return (
    <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2" role="note" aria-label="Rationale">
      <p className="flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wide text-primary">
        <Lightbulb size={12} aria-hidden="true" /> Rationale
      </p>
      <p className={`mt-0.5 text-sm ${text ? 'text-ink-700' : 'text-ink-400 italic'}`}>
        {text || 'No rationale was saved for this question.'}
      </p>
    </div>
  );
}
