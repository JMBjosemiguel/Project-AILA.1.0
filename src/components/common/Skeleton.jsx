export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-ink-100 rounded-lg ${className}`} />;
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white border border-ink-100 rounded-2xl shadow-soft p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonBlock className="h-2 w-full mt-4" />
    </div>
  );
}

export function SkeletonRow({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${className}`}>
      <SkeletonBlock className="w-5 h-5 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <SkeletonBlock className="h-3.5 w-1/2" />
        <SkeletonBlock className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`bg-white border border-ink-100 rounded-2xl shadow-soft p-4 flex flex-col gap-2 ${className}`}>
      <SkeletonBlock className="w-8 h-8 rounded-lg" />
      <SkeletonBlock className="h-6 w-1/2" />
      <SkeletonBlock className="h-3 w-2/3" />
    </div>
  );
}

export function SkeletonList({ count = 3, className = '' }) {
  return (
    <div className={`flex flex-col divide-y divide-ink-50 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 4, className = '' }) {
  return (
    <div className={`grid sm:grid-cols-2 gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
