import { Bell, LogOut, Menu, Moon, Search, Sun, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STUDENT_NAV_GROUPS, STUDENT_ROUTE_IDS, STUDENT_ROUTES } from '../../app/routes/studentRoutes';
import ActionMenu from '../../components/common/ActionMenu';
import { useConfirm } from '../../components/common/ConfirmDialog';
import ThemeToggle from '../../components/common/ThemeToggle';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationsData } from '../../hooks/useNotificationsData';
import { useTheme } from '../../hooks/useTheme';

const STUDENT_SEARCH_DESTINATIONS = STUDENT_NAV_GROUPS.flatMap((group) => group.items);
// Tailwind's `sm` breakpoint — below this the topbar switches to the compact
// phone layout (menu, title, search icon, bell, avatar) and the search panel
// goes full-screen; at/above it, everything is unchanged from before.
const MOBILE_QUERY = '(max-width: 639px)';

function routeMatches(route, query) {
  const haystack = [route.label, route.title, route.subtitle, route.path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

// Driven by matchMedia (not CSS) so exactly one topbar/search presentation is
// ever actually rendered — simpler to reason about and to test than two
// CSS-hidden copies, and it updates live if the viewport is resized.
function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => setIsMobile(event.matches);
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleChange);
    else mediaQuery.addListener?.(handleChange);
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', handleChange);
      else mediaQuery.removeListener?.(handleChange);
    };
  }, []);

  return isMobile;
}

// Shared between the desktop dropdown and the mobile full-screen panel so
// results and keyboard navigation are identical in both — not two
// re-implementations that could drift apart.
function SearchResultsList({ results, activeIndex, setActiveIndex, onSelect }) {
  if (!results.length) {
    return (
      <div className="py-10 text-center text-sm text-ink-400">
        <p className="font-semibold text-ink-600">No results found</p>
        <p className="text-xs mt-1">Try another destination.</p>
      </div>
    );
  }

  return (
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
            onClick={() => onSelect(destination)}
            className={[
              'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
              selected ? 'bg-primary-50 text-primary' : 'text-ink-700 hover:bg-ink-50',
            ].join(' ')}
          >
            <span className={[
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
              selected ? 'bg-surface text-primary' : 'bg-ink-50 text-ink-400',
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
  );
}

export default function StudentTopbar({ active, sidebarOpen, onMenuClick, onNavigate }) {
  const { logout, user } = useAuth();
  const confirm = useConfirm();
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobileViewport();
  const route = STUDENT_ROUTES[active] || {};
  const avatarLetter = user?.first_name?.[0] ?? 'A';
  const { data: notificationsData } = useNotificationsData(active);
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef(null);
  const headerSearchRef = useRef(null);
  const mobilePanelRef = useRef(null);
  // Mobile-back-closes-the-panel bookkeeping (mirrors LessonReader's own
  // history.back() pattern): engaged only when opened on a phone-width
  // viewport, so desktop never gets an extra history entry.
  const historyEngagedRef = useRef(false);
  const closedByPopRef = useRef(false);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? STUDENT_SEARCH_DESTINATIONS.filter((destination) => routeMatches(destination, normalized))
      : STUDENT_SEARCH_DESTINATIONS;
  }, [query]);

  // Consistent while any full-screen dialog is open (the lesson reader, quiz
  // runner, confirm dialog, ...) — the palette would otherwise render behind
  // it (lower z-index), so it simply doesn't open at all rather than opening
  // invisibly.
  const openPalette = () => {
    if (document.querySelector('[role="dialog"]')) return;
    setPaletteOpen(true);
  };

  // The raw reset — used directly for passive closes (losing focus/visibility,
  // navigating to a different page) where triggering a browser Back would be
  // wrong, since nothing was "backed out of".
  const closePalette = () => {
    setPaletteOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  // What every user-facing dismiss (X button, Escape, selecting a result,
  // clicking outside) calls instead: routes through history.back() when the
  // mobile panel engaged it, so a single real Back press and an in-app close
  // both consume exactly one history entry, never an orphaned one.
  const requestClosePalette = () => {
    if (historyEngagedRef.current && !closedByPopRef.current) {
      window.history.back();
      return;
    }
    closePalette();
  };

  // Selecting a result while the mobile panel's history entry is active must
  // NOT go through requestClosePalette's history.back() — back() is
  // asynchronous (it resolves on a later tick, as a real popstate), so by
  // the time it actually moves the cursor, the pushState below has already
  // moved it past the panel's entry, and the "back" lands one step behind
  // where it meant to: right back on the original page. Replacing the
  // panel's own entry with the destination instead needs no async wait and
  // never fires popstate, so the router's own listener can't double-react.
  const navigateTo = (destination) => {
    if (!destination) return;

    if (destination.id === active) {
      // Already there — just close, exactly like dismissing without picking
      // anything. No page change means nothing to replace the entry with.
      requestClosePalette();
      return;
    }

    if (historyEngagedRef.current && !closedByPopRef.current) {
      historyEngagedRef.current = false;
      closePalette();
      onNavigate(destination.id, { replace: true });
      return;
    }

    requestClosePalette();
    onNavigate(destination.id);
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out?',
      message: "You'll need to sign in again to continue.",
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await logout();
    } catch {
      // Best-effort — the student is leaving the page regardless (see
      // AuthContext.logout, which already clears the session locally even
      // when the request itself fails).
    } finally {
      onNavigate('/login');
    }
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
    if (!paletteOpen) return undefined;
    const handleClickOutside = (event) => {
      const insideDesktop = headerSearchRef.current?.contains(event.target);
      const insideMobile = mobilePanelRef.current?.contains(event.target);
      if (!insideDesktop && !insideMobile) requestClosePalette();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen]);

  // Engages the history trick only on a phone-width viewport, at the moment
  // the panel opens — never on desktop/tablet, where the dropdown behaves
  // exactly as it always has.
  useEffect(() => {
    if (!paletteOpen || !isMobile) return undefined;

    historyEngagedRef.current = true;
    closedByPopRef.current = false;
    window.history.pushState({ studentSearchPanel: true }, '');
    const handlePopState = () => {
      closedByPopRef.current = true;
      closePalette();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      historyEngagedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen]);

  // Background scroll lock while the full-screen mobile panel is open —
  // same technique as useMobileDrawer/LessonReader, inlined here (rather than
  // reusing that hook) so its own Escape handler can't double-fire alongside
  // handlePaletteKeyDown's, which already closes on Escape for both panels.
  useEffect(() => {
    if (!paletteOpen || !isMobile) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [paletteOpen, isMobile]);

  useEffect(() => {
    closePalette();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const closeOnHidden = () => {
      if (document.hidden) closePalette();
    };
    const closeOnBlur = () => closePalette();

    document.addEventListener('visibilitychange', closeOnHidden);
    window.addEventListener('blur', closeOnBlur);
    return () => {
      document.removeEventListener('visibilitychange', closeOnHidden);
      window.removeEventListener('blur', closeOnBlur);
    };
  }, []);

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
      requestClosePalette();
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

  if (isMobile) {
    const avatarMenuItems = [
      { label: 'Profile', icon: <UserRound size={14} />, onClick: () => onNavigate(STUDENT_ROUTE_IDS.PROFILE) },
      {
        label: theme === 'dark' ? 'Light mode' : 'Dark mode',
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        onClick: toggleTheme,
      },
      { label: 'Log out', icon: <LogOut size={14} />, danger: true, onClick: handleLogout },
    ];

    return (
      <>
      <header className="sticky top-0 z-40 h-16 flex items-center gap-2 px-4 bg-surface/80 backdrop-blur-md border-b border-ink-100">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          aria-expanded={sidebarOpen}
          aria-controls="student-sidebar-nav"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50"
        >
          <Menu size={18} />
        </button>

        <h1 className="flex-1 min-w-0 font-display font-bold text-ink-800 text-[1.05rem] leading-tight truncate">
          {route.title}
        </h1>

        <button
          onClick={openPalette}
          aria-label="Search AILA"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50"
        >
          <Search size={18} />
        </button>

        <button
          onClick={() => onNavigate(STUDENT_ROUTE_IDS.NOTIFICATIONS)}
          aria-label="View notifications"
          className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 border border-surface" />
          )}
        </button>

        <ActionMenu
          label="Account menu"
          icon={avatarLetter}
          triggerClassName="w-11 h-11 flex-shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          items={avatarMenuItems}
        />

      </header>

      {/* Portaled to document.body (same pattern as AddCourseWizard): the
          header has backdrop-blur, which creates a new containing block for
          `position: fixed` descendants — a fixed child rendered INSIDE the
          header gets clipped to the header's own 64px box instead of
          covering the viewport. Rendering it as a sibling of the header via
          a portal avoids that entirely, regardless of where this sits in
          the component tree. */}
      {paletteOpen && createPortal(
        <div
          ref={mobilePanelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-command-palette-title"
          className="fixed inset-0 h-dvh z-[110] bg-surface flex flex-col"
        >
          <div className="h-14 flex items-center gap-2 px-4 border-b border-ink-100 flex-shrink-0">
            <Search size={16} className="text-ink-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handlePaletteKeyDown}
              placeholder="Search AILA..."
              aria-label="Search AILA"
              className="flex-1 bg-transparent outline-none text-base text-ink-800 placeholder:text-ink-400 min-w-0"
            />
            <button
              type="button"
              onClick={requestClosePalette}
              aria-label="Close search"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
            <h2 id="student-command-palette-title" className="sr-only">Search AILA destinations</h2>
            <SearchResultsList results={results} activeIndex={activeIndex} setActiveIndex={setActiveIndex} onSelect={navigateTo} />
          </div>
        </div>,
        document.body
      )}
    </>
    );
  }

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center gap-4 px-4 lg:px-8 bg-surface/80 backdrop-blur-md border-b border-ink-100">
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
        <div ref={headerSearchRef} className="relative w-full max-w-md h-9">
          {!paletteOpen && (
            <div className="h-9 w-full flex items-center gap-2 bg-ink-50 border border-ink-100 focus-within:border-primary-300 focus-within:bg-surface rounded-xl px-3 transition-colors">
              <Search size={15} className="text-ink-400 flex-shrink-0" />
              <input
                readOnly
                onClick={openPalette}
                onFocus={openPalette}
                placeholder="Search AILA..."
                className="flex-1 bg-transparent outline-none text-sm text-ink-800 placeholder:text-ink-400 min-w-0"
              />
            </div>
          )}

          {paletteOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-command-palette-title"
              className="absolute top-0 left-0 z-50 w-full bg-surface rounded-xl shadow-soft ring-1 ring-inset ring-primary-300 overflow-hidden"
            >
              <div className="h-9 flex items-center gap-2 px-3">
                <Search size={15} className="text-ink-400 flex-shrink-0" />
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
                  onClick={requestClosePalette}
                  aria-label="Close search"
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-800"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto scrollbar-thin p-2 border-t border-ink-100">
                <h2 id="student-command-palette-title" className="sr-only">Search AILA destinations</h2>
                <SearchResultsList results={results} activeIndex={activeIndex} setActiveIndex={setActiveIndex} onSelect={navigateTo} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <button
          onClick={() => onNavigate(STUDENT_ROUTE_IDS.NOTIFICATIONS)}
          aria-label="View notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border border-surface" />
          )}
        </button>
        <button onClick={() => onNavigate(STUDENT_ROUTE_IDS.PROFILE)} className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
          {avatarLetter}
        </button>
        <button
          onClick={handleLogout}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 transition-colors"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
