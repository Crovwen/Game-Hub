import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((text, variant = 'default') => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, text, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto animate-pop-in card-premium max-w-sm w-full rounded-xl2 px-4 py-3 text-sm text-center shadow-card',
              t.variant === 'error' ? 'border-lose/40 text-lose' : '',
              t.variant === 'success' ? 'border-win/40 text-win' : '',
            ].join(' ')}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
