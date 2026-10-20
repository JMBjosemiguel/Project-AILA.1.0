import { useSyncExternalStore } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import Button from './Button';
import { getConnectivityState, subscribeConnectivity } from '../../services/api/connectivityStatus';

// Sits at z-[60] — above ordinary page content, but below the sidebar
// backdrop (z-90) and everything stacked on it, including the mobile search
// panel (z-110, see StudentTopbar.jsx). An outage banner is useful, but it
// must never cover that full-screen panel.
export default function ConnectivityBanner() {
  const { status } = useSyncExternalStore(subscribeConnectivity, getConnectivityState, getConnectivityState);

  if (status === 'online') return null;

  return (
    <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[60] w-full px-4 flex justify-center pointer-events-none">
      {status === 'reconnecting' && (
        <div className="pointer-events-auto flex items-center gap-2 bg-surface border border-ink-100 rounded-full shadow-card px-4 py-2 text-sm text-ink-700">
          <Loader2 size={14} className="animate-spin text-primary" />
          Reconnecting to AILA…
        </div>
      )}

      {status === 'unavailable' && (
        <div className="pointer-events-auto flex items-center gap-3 bg-surface border border-ink-100 rounded-xl shadow-card px-4 py-3 text-sm text-ink-700 max-w-sm">
          <WifiOff size={16} className="flex-shrink-0 text-ink-400" />
          <span className="flex-1">AILA&apos;s server is waking up. Please try again in a moment.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}
    </div>
  );
}
