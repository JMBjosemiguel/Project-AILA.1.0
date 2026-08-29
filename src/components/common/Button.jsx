const variants = {
  primary: 'bg-primary text-white shadow-lift hover:bg-primary-600 active:scale-[0.98]',
  outline: 'bg-white text-ink-800 border border-ink-100 hover:border-primary-300 hover:text-primary',
  ghost: 'bg-transparent text-ink-400 hover:bg-ink-50 hover:text-ink-800',
  subtle: 'bg-primary-50 text-primary hover:bg-primary-100',
  danger: 'bg-rose-600 text-white shadow-lift hover:bg-rose-700 active:scale-[0.98]',
};

const sizes = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-sm px-5 py-3 gap-2',
};

export default function Button({
  children, variant = 'primary', size = 'md', className = '', icon, onClick, type = 'button', full = false, disabled = false,
  'aria-label': ariaLabel, title,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={[
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-1',
        variants[variant], sizes[size],
        full ? 'w-full' : '',
        disabled ? 'opacity-50 pointer-events-none' : '',
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
