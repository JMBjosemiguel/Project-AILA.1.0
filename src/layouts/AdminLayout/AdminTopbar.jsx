import { Command, LogOut, Menu, Search } from 'lucide-react';
import { ADMIN_ROUTES } from '../../app/routes/adminRoutes';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminTopbar({ active, onMenuClick, onNavigate }) {
  const { logout, user } = useAuth();
  const route = ADMIN_ROUTES[active] || {};
  const avatarLetter = user?.first_name?.[0] ?? 'A';

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center gap-4 px-4 lg:px-8 bg-white/90 backdrop-blur-md border-b border-ink-100">
      <button onClick={onMenuClick} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50">
        <Menu size={18} />
      </button>

      <div className="hidden md:block min-w-0">
        <h1 className="font-display font-bold text-ink-800 text-[1.05rem] leading-tight truncate">{route.title}</h1>
        <p className="text-xs text-ink-400 truncate">{route.subtitle}</p>
      </div>

      <div className="flex-1 flex justify-end md:justify-center">
        <div className="w-full max-w-md flex items-center gap-2 bg-ink-50 border border-ink-100 focus-within:border-primary-300 focus-within:bg-white rounded-xl px-3 py-2 transition-colors">
          <Search size={15} className="text-ink-400 flex-shrink-0" />
          <input
            placeholder="Search admin records..."
            className="flex-1 bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 min-w-0"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[0.65rem] text-ink-400 bg-white border border-ink-100 rounded px-1.5 py-0.5">
            <Command size={10} />K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button className="w-9 h-9 rounded-full bg-ink-900 text-white flex items-center justify-center text-xs font-bold">
          {avatarLetter}
        </button>
        <button
          onClick={async () => { await logout(); onNavigate('/login'); }}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors"
          title="Log out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
