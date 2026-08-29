import { domainColor, domainTint } from './DomainChip';

export default function StatCard({ label, value, delta, trend = 'neutral', subject, icon: Icon }) {
  const color = domainColor(subject);
  const tint = domainTint(subject);
  const trendColor = trend === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-ink-400 bg-ink-50';
  return (
    <div className="bg-white border border-ink-100 rounded-2xl p-5 shadow-soft hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: tint, color }}>
          {Icon ? <Icon size={16} /> : '●'}
        </div>
        {delta && (
          <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${trendColor}`}>
            {delta}
          </span>
        )}
      </div>
      <div className="text-2xl font-display font-bold text-ink-800 leading-none">{value}</div>
      <div className="text-xs text-ink-400 font-medium mt-1.5">{label}</div>
    </div>
  );
}
