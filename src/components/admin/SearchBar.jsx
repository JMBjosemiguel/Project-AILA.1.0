import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`flex items-center gap-2 bg-white border border-ink-100 focus-within:border-primary-300 rounded-xl px-3.5 py-2.5 ${className}`}>
      <Search size={15} className="text-ink-400 flex-shrink-0" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1 outline-none text-sm bg-transparent placeholder:text-ink-400 min-w-0"
      />
    </div>
  );
}
