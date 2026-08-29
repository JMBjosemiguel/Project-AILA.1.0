import { X } from 'lucide-react';
import { STUDENT_NAV_GROUPS, STUDENT_ROUTE_IDS } from '../../app/routes/studentRoutes';
import { useAuth } from '../../contexts/AuthContext';
import AilaOrb from '../../components/common/AilaOrb';

export default function StudentSidebar({ active, onNavigate, open, onClose }) {
  const { user } = useAuth();
  const navGroups = STUDENT_NAV_GROUPS;
  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Profile pending';
  const profileLine = user?.profile?.program ? `${user.profile.program} - Yr ${user.profile.year_level ?? ''}` : 'Student';
  const avatarLetter = user?.first_name?.[0] ?? 'A';

  return (
    <aside
      className={[
        'fixed lg:static top-0 left-0 bottom-0 z-[100] w-64 flex-shrink-0',
        'bg-white border-r border-ink-100 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-5 py-5 border-b border-ink-100">
        <div className="flex items-center gap-2.5">
          <AilaOrb size={30} />
          <div className="leading-none">
            <div className="font-display font-bold text-ink-800 text-[0.95rem]">AILA</div>
            <div className="text-[0.65rem] text-ink-400 font-medium">Learning Assistant</div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50">
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 flex flex-col gap-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-400/80 px-3 mb-1.5">
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
                      isActive ? 'bg-primary-50 text-primary font-semibold' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
                    ].join(' ')}
                  >
                    <Icon size={17} strokeWidth={2} className={isActive ? 'text-primary' : 'text-ink-400'} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-ink-100">
        <button
          onClick={() => onNavigate(STUDENT_ROUTE_IDS.PROFILE)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-ink-50 hover:bg-ink-100 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <div className="text-[0.8rem] font-semibold text-ink-800 truncate">{displayName}</div>
            <div className="text-[0.7rem] text-ink-400 truncate">{profileLine}</div>
          </div>
        </button>
      </div>
    </aside>
  );
}
