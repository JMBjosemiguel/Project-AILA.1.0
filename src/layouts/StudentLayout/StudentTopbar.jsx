import { Bell, LogOut, Menu, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STUDENT_NAV_GROUPS, STUDENT_ROUTE_IDS, STUDENT_ROUTES } from '../../app/routes/studentRoutes';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationsData } from '../../hooks/useNotificationsData';

const STUDENT_SEARCH_DESTINATIONS = STUDENT_NAV_GROUPS.flatMap((group) => group.items);

function routeMatches(route, query) {
  const haystack = [route.label, route.title, route.subtitle, route.path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export default function StudentTopbar({ active, sidebarOpen, onMenuClick, onNavigate }) {
  const { logout, user } = useAuth();
  const route = STUDENT_ROUTES[active] || {};
  const avatarLetter = user?.first_name?.[0] ?? 'A';
  const { data: notificationsData } = useNotificationsData(active);
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? STUDENT_SEARCH_DESTINATIONS.filter((destination) => routeMatches(destination, normalized))
      : STUDENT_SEARCH_DESTINATIONS;
  }, [query]);

  const openPalette = () => {
    setPaletteOpen(true);
  };

  const closePalette = () => {
    setPaletteOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const navigateTo = (destination) => {
    if (!destination) return;
    closePalette();
    onNavigate(destination.id);
  };

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    searchInputRef.current?.focus();
  }, [paletteOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(results.length - 1, 0));
    }
  }, [activeIndex, results.length]);

  const handlePaletteKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length) setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length) setActiveIndex((current) => (current - 1 + results.length) % results.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      navigateTo(results[activeIndex]);
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center gap-4 px-4 lg:px-8 bg-white/80 backdrop-blur-md border-b border-ink-100">
      <button
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        aria-expanded={sidebarOpen}
        aria-controls="student-sidebar-nav"
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50"
      >
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
            readOnly
            onClick={openPalette}
            onFocus={openPalette}
            placeholder="Search AILA..."
            className="flex-1 bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 min-w-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onNavigate(STUDENT_ROUTE_IDS.NOTIFICATIONS)}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border border-white" />
          )}
        </button>
        <button onClick={() => onNavigate(STUDENT_ROUTE_IDS.PROFILE)} className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
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

      {paletteOpen && (
        <div
          className="fixed inset-0 z-[160] bg-ink-900/40 flex items-start justify-center px-4 pt-20 sm:pt-24"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePalette();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-command-palette-title"
            className="w-full max-w-lg bg-white border border-ink-100 rounded-2xl shadow-soft overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
              <Search size={16} className="text-ink-400 flex-shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search AILA..."
                aria-label="Search AILA"
                className="flex-1 bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 min-w-0"
              />
              <button
                type="button"
                onClick={closePalette}
                aria-label="Close search"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800"
              >
                <X size={15} />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              <h2 id="student-command-palette-title" className="sr-only">Search AILA destinations</h2>
              {results.length ? (
                <div role="listbox" aria-label="Student destinations" className="flex flex-col gap-1">
                  {results.map((destination, index) => {
                    const Icon = destination.icon;
                    const selected = index === activeIndex;

                    return (
                      <button
                        key={destination.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => navigateTo(destination)}
                        className={[
                          'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          selected ? 'bg-primary-50 text-primary' : 'text-ink-700 hover:bg-ink-50',
                        ].join(' ')}
                      >
                        <span className={[
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          selected ? 'bg-white text-primary' : 'bg-ink-50 text-ink-400',
                        ].join(' ')}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold truncate">{destination.label}</span>
                          <span className="block text-xs text-ink-400 truncate">{destination.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-ink-400">
                  <p className="font-semibold text-ink-600">No results found</p>
                  <p className="text-xs mt-1">Try another destination.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
