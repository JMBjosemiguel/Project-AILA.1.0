import { ArrowRight, Sparkles } from 'lucide-react';
import AilaOrb from '../../common/AilaOrb';
import Button from '../../common/Button';

export default function AIInsightCard({ recommendation, onReview, onAskAila }) {
  if (!recommendation) return null;

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-5 mb-5">
      <AilaOrb size={40} pulse />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-primary mb-1">
          <Sparkles size={12} /> AI Insight
        </div>
        <h3 className="font-display font-semibold text-ink-800 text-base mb-1">{recommendation.title}</h3>
        <p className="text-sm text-ink-500 leading-relaxed mb-3">{recommendation.message}</p>
        <div className="flex gap-2">
          {recommendation.lessonId && (
            <Button size="sm" icon={<ArrowRight size={14} />} onClick={onReview}>Review now</Button>
          )}
          <Button size="sm" variant="outline" icon={<Sparkles size={14} />} onClick={onAskAila}>Ask AILA about it</Button>
        </div>
      </div>
    </div>
  );
}
