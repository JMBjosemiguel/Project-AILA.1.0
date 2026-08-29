import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export default function ActionMenu({ items, label = 'Open actions menu', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex-shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className={[
            'absolute top-9 z-20 min-w-[9.5rem] bg-white border border-ink-100 rounded-xl shadow-card py-1.5',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={[
                'w-full flex items-center gap-2.5 text-left px-3.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none',
                item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-700 hover:bg-ink-50',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
