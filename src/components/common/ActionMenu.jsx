import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

const VIEWPORT_PADDING = 8;
const ESTIMATED_MENU_WIDTH = 152; // matches min-w-[9.5rem], used only until the real size is measured

export default function ActionMenu({ items, label = 'Open actions menu' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Right-aligns the menu to the trigger and keeps it inside the viewport,
  // opening upward when there isn't room below. Runs once from the click (using
  // an estimated width, before the menu exists) and again via useLayoutEffect
  // once the real menu is in the DOM, so it never falls back to a default spot.
  const computePosition = useCallback((menuWidth, menuHeight) => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();

    let left = rect.right - menuWidth;
    left = Math.min(Math.max(left, VIEWPORT_PADDING), window.innerWidth - menuWidth - VIEWPORT_PADDING);

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = menuHeight > 0 && spaceBelow < menuHeight + VIEWPORT_PADDING && rect.top > spaceBelow;
    const top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;

    return { top, left, openUp };
  }, []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setPosition(computePosition(ESTIMATED_MENU_WIDTH, 0));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const { offsetWidth, offsetHeight } = menuRef.current;
    const next = computePosition(offsetWidth, offsetHeight);
    if (next) setPosition(next);
    // Measuring the mounted menu's real size can change where it should sit —
    // intentionally not depending on `position` itself to avoid re-measuring in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const inTrigger = triggerRef.current?.contains(event.target);
      const inMenu = menuRef.current?.contains(event.target);
      if (!inTrigger && !inMenu) close();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    const handleScrollOrResize = () => close();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    // capture:true catches scrolling inside any ancestor (e.g. a table's own
    // overflow-x-auto wrapper), not just the window.
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, close]);

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-800 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
      >
        <MoreVertical size={15} />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: position.top, left: position.left, visibility: position ? 'visible' : 'hidden' }}
          className="z-[130] min-w-[9.5rem] bg-white border border-ink-100 rounded-xl shadow-card py-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onClick();
              }}
              className={[
                'w-full flex items-center gap-2.5 text-left px-3.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none',
                item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-700 hover:bg-ink-50',
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
