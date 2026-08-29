export default function EmptyState({ title = 'Nothing here yet', message = 'This will fill in as you use AILA.', className = '', icon: Icon, action }) {
  return (
    <div className={`text-center py-10 px-4 text-sm text-ink-400 border border-dashed border-ink-100 rounded-xl ${className}`}>
      {Icon && (
        <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-ink-50 flex items-center justify-center text-ink-300">
          <Icon size={18} />
        </div>
      )}
      <p className="font-semibold text-ink-600">{title}</p>
      <p className="text-xs mt-1">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
