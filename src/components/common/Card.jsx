export default function Card({ children, className = '', padded = true, hover = false }) {
  return (
    <div
      className={[
        'bg-white border border-ink-100 rounded-2xl shadow-soft',
        padded ? 'p-5' : '',
        hover ? 'transition-shadow hover:shadow-card' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-[0.95rem] font-semibold text-ink-800">{title}</h3>
        {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
