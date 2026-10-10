export default function XpPill({ amount, className = '' }) {
  if (amount == null) return null;
  return (
    <span className={`inline-flex items-center flex-shrink-0 text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap ${className}`}>
      +{amount} XP
    </span>
  );
}
