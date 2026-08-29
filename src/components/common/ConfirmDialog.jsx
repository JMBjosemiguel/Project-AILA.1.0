import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(({ title = 'Are you sure?', message = '', confirmLabel = 'Delete', cancelLabel = 'Cancel' } = {}) => {
    setDialog({ title, message, confirmLabel, cancelLabel });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result) => {
    setDialog(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[150] bg-ink-900/50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="w-full max-w-sm bg-white border border-ink-100 rounded-2xl shadow-soft p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} />
              </div>
              <div className="min-w-0">
                <h3 id="confirm-dialog-title" className="text-[0.95rem] font-semibold text-ink-800">{dialog.title}</h3>
                {dialog.message && <p className="text-xs text-ink-400 mt-1">{dialog.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => settle(false)}>{dialog.cancelLabel}</Button>
              <Button variant="danger" size="sm" onClick={() => settle(true)}>{dialog.confirmLabel}</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
