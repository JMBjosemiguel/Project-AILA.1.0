import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

const ToastContext = createContext({ toast: () => {} });

const VARIANT_STYLE = {
  success: { icon: CheckCircle2, iconColor: 'text-emerald-500' },
  error: { icon: XCircle, iconColor: 'text-rose-500' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message, variant = 'success') => {
    const id = idRef.current += 1;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => dismiss(id), 3200);
  }, [dismiss]);

  const value = {
    toast,
    success: (message) => toast(message, 'success'),
    error: (message) => toast(message, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((item) => {
          const meta = VARIANT_STYLE[item.variant] || VARIANT_STYLE.success;
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-center gap-2.5 bg-white border border-ink-100 rounded-xl shadow-card px-4 py-3 max-w-sm animate-fadeUp"
            >
              <Icon size={16} className={`flex-shrink-0 ${meta.iconColor}`} />
              <span className="text-sm text-ink-800 flex-1">{item.message}</span>
              <button
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="flex-shrink-0 text-ink-300 hover:text-ink-600"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
