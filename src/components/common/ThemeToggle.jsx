import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle, className = '' }) {
  const isDark = theme === 'dark';
  // The label names what clicking does, not the current state.
  const label = isDark ? 'Light mode' : 'Dark mode';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={[
        'h-9 w-9 xl:w-auto flex-shrink-0 flex items-center justify-center xl:justify-start gap-2 xl:px-3 rounded-lg text-ink-600 hover:bg-ink-50 transition-colors',
        className,
      ].join(' ')}
    >
      {isDark ? <Sun size={17} className="flex-shrink-0" /> : <Moon size={17} className="flex-shrink-0" />}
      <span className="hidden xl:inline text-sm font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}
