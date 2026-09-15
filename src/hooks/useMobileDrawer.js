import { useEffect, useRef } from 'react';

// Shared mobile-drawer behavior: locks background scroll and closes on
// Escape while a drawer/overlay (sidebar nav, chat conversation list, ...) is
// open. `onClose` doesn't need to be memoized by the caller — the latest
// version is always used via a ref, so the effect only re-subscribes when
// `open` itself changes.
export function useMobileDrawer(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);
}
