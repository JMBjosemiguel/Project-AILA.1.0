import { useState } from 'react';

const CHART_WIDTH = 500;
const CHART_HEIGHT = 160;
const PAD_LEFT = 32;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

function shortLabel(dateStr) {
  // The API may send a plain 'YYYY-MM-DD' or a full ISO datetime (a MySQL DATE
  // column serializes as midnight UTC) — only the first 10 chars matter here.
  const datePart = String(dateStr).slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Shared line/area chart for "Weekly performance trend" and "XP over time".
// Handles 0/1/2+ data points explicitly — the old version collapsed a single
// point into a degenerate SVG path (a faint filled triangle, no visible line).
export default function TrendLine({ points, color = '#2563EB', maxValue = null, unit = '%' }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (points.length === 1) {
    const only = points[0];
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-2xl font-bold" style={{ color }}>{only.value}{unit}</span>
        <span className="text-xs text-ink-400">{shortLabel(only.date)} — one day of data so far</span>
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const max = maxValue ?? Math.max(...values, 1);
  const stepX = PLOT_WIDTH / (points.length - 1);

  const coords = points.map((point, index) => ({
    x: PAD_LEFT + index * stepX,
    y: PAD_TOP + PLOT_HEIGHT - (Math.min(point.value, max) / (max || 1)) * PLOT_HEIGHT,
    point,
  }));

  const linePath = coords.map((c, index) => `${index === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const baseline = PAD_TOP + PLOT_HEIGHT;
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${baseline} L${coords[0].x},${baseline} Z`;
  const gradientId = `trendGrad-${color.replace('#', '')}`;

  const gridValues = [...new Set([max, Math.round(max / 2), 0])];
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const active = activeIndex != null ? coords[activeIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-40"
        preserveAspectRatio="none"
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v) => {
          const y = PAD_TOP + PLOT_HEIGHT - (v / (max || 1)) * PLOT_HEIGHT;
          return (
            <g key={v}>
              <line x1={PAD_LEFT} y1={y} x2={CHART_WIDTH - PAD_RIGHT} y2={y} stroke="rgb(var(--ink-100))" strokeWidth="1" />
              <text x={PAD_LEFT - 5} y={y} textAnchor="end" dominantBaseline="middle" fill="rgb(var(--ink-400))" fontSize="9">{v}{unit}</text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, index) => (
          <g key={c.point.date}>
            {(index % labelEvery === 0 || index === coords.length - 1) && (
              <text x={c.x} y={CHART_HEIGHT - 6} textAnchor="middle" fill="rgb(var(--ink-400))" fontSize="9">{shortLabel(c.point.date)}</text>
            )}
            <circle cx={c.x} cy={c.y} r={activeIndex === index ? 4.5 : 3} fill={color} stroke="rgb(var(--surface))" strokeWidth="1.5" />
            <circle
              cx={c.x}
              cy={c.y}
              r={10}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActiveIndex(index)}
              onTouchStart={() => setActiveIndex((current) => (current === index ? null : index))}
            />
          </g>
        ))}
      </svg>

      {active && (
        <div
          className="absolute pointer-events-none bg-ink-900 text-white text-xs font-medium rounded-md px-2 py-1 shadow-soft whitespace-nowrap -translate-x-1/2 -translate-y-full"
          style={{ left: `${(active.x / CHART_WIDTH) * 100}%`, top: `${(active.y / CHART_HEIGHT) * 100}%` }}
        >
          {shortLabel(active.point.date)}: {active.point.value}{unit}
        </div>
      )}
    </div>
  );
}
