export default function ProgressBar({ value, color = '#2563EB', height = 8, className = '' }) {
  return (
    <div className={`w-full rounded-full overflow-hidden bg-ink-100 ${className}`} style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}
