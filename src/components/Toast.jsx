import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function ToastList({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
              ? AlertCircle
              : Info;

        return (
          <div key={toast.id} className={`toast ${toast.type || 'info'}`}>
            <Icon size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: 4, border: 'none' }}
              onClick={() => onDismiss(toast.id)}
              aria-label="إغلاق"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
