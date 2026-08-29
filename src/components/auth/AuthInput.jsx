export default function AuthInput({ label, icon: Icon, rightElement, type = 'text', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-ink-800">{label}</label>}
      <div className="relative flex items-center">
        {Icon && <Icon size={16} className="absolute left-3 text-ink-400 pointer-events-none" />}
        <input
          type={type}
          className={[
            'w-full border border-ink-100 focus:border-primary-300 rounded-xl py-2.5 text-sm outline-none transition-colors placeholder:text-ink-400',
            Icon ? 'pl-9' : 'pl-3.5',
            rightElement ? 'pr-10' : 'pr-3.5',
          ].join(' ')}
          {...props}
        />
        {rightElement && <div className="absolute right-3 flex items-center">{rightElement}</div>}
      </div>
    </div>
  );
}
