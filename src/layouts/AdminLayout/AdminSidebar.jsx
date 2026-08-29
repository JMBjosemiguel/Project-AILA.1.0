import { X } from 'lucide-react';
import { ADMIN_NAV_GROUPS } from '../../app/routes/adminRoutes';
import AilaOrb from '../../components/common/AilaOrb';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminSidebar({ active, onNavigate, open, onClose }) {
  const { user } = useAuth();
  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Administrator';
  const avatarLetter = user?.first_name?.[0] ?? 'A';

  return (
    <aside
      className={[
        'fixed lg:static top-0 left-0 bottom-0 z-[100] w-64 flex-shrink-0',
        'bg-ink-900 text-white flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <AilaOrb size={30} />
          <div className="leading-none">
            <div className="font-display font-bold text-white text-[0.95rem]">AILA Admin</div>
            <div className="text-[0.65rem] text-white/45 font-medium">Control Portal</div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:bg-white/10">
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 flex flex-col gap-5">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-white/35 px-3 mb-1.5">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left',
                      isActive ? 'bg-white text-ink-900 font-semibold' : 'text-white/70 hover:bg-white/10 hover:text-white',
                    ].join(' ')}
                  >
                    <Icon size={17} strokeWidth={2} className={isActive ? 'text-primary' : 'text-white/45'} />
                    <span className="flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/10 text-left">
          <div className="w-8 h-8 rounded-full bg-white text-ink-900 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <div className="text-[0.8rem] font-semibold text-white truncate">{displayName}</div>
            <div className="text-[0.7rem] text-white/45 truncate">Administrator</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
