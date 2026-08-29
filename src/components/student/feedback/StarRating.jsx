import { Star } from 'lucide-react';

export default function StarRating({ value, onChange, readOnly = false, size = 22 }) {
  if (readOnly) {
    return (
      <div className="flex gap-0.5" aria-label={`Rated ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} fill={i <= value ? '#f59e0b' : 'none'} stroke={i <= value ? '#f59e0b' : '#CBD5E1'} strokeWidth={1.5} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} onClick={() => onChange(i)} aria-label={`Rate ${i} out of 5`} className="transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded">
          <Star
            size={size}
            fill={i <= value ? '#f59e0b' : 'none'}
            stroke={i <= value ? '#f59e0b' : '#CBD5E1'}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
