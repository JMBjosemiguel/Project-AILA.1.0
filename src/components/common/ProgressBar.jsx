export default function ProgressBar({ value, color = '#2563EB', track = '#F1F5F9', height = 8, className = '' }) {
  return (
    <div className={`w-full rounded-full overflow-hidden ${className}`} style={{ height, background: track }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}
