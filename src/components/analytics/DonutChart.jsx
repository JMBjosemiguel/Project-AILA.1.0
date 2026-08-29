export default function DonutChart({ data }) {
  if (!data.length) return null;

  const r = 36;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 100 100" width="112" height="112" className="-rotate-90 flex-shrink-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F1F5F9" strokeWidth="14" />
        {data.map((d) => {
          const len = (d.pct / 100) * circumference;
          const circle = (
            <circle
              key={d.label}
              cx="50" cy="50" r={r} fill="none"
              stroke={d.color} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return circle;
        })}
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs text-ink-600">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            {d.label} <span className="text-ink-400">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
