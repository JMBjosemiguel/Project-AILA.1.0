export default function BarChart({ data, valueKey = 'hours', labelKey = 'day', unit = 'h' }) {
  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d[valueKey]));
  return (
    <div className="flex items-end gap-3 h-40 pt-2">
      {data.map((d) => {
        const pct = (d[valueKey] / max) * 100;
        const isPeak = d[valueKey] === max;
        return (
          <div key={d[labelKey]} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <span className="text-[0.65rem] font-semibold text-ink-400">{d[valueKey]}{unit}</span>
            <div
              className="w-full rounded-t-md transition-all duration-700"
              style={{ height: `${pct}%`, background: isPeak ? '#2563EB' : '#DBEAFE' }}
            />
            <span className="text-[0.65rem] font-medium text-ink-400">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}
