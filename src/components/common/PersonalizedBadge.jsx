import { Sparkles } from 'lucide-react';

const TOOLTIP = 'AILA tuned this to your course progress, recent quiz performance and preferred difficulty.';

// Shows only when generation actually used the student's performance history
// ('performance_aware'). 'basic' generation (profile + requested difficulty
// only) gets no badge — we don't claim "adaptive" when there is no signal.
export default function PersonalizedBadge({ level, className = '' }) {
  if (level !== 'performance_aware') return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary ${className}`}
      title={TOOLTIP}
    >
      <Sparkles size={11} /> Personalized for you
    </span>
  );
}
