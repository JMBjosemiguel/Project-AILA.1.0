import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle, className = '' }) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={[
        'w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors',
        className,
      ].join(' ')}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
