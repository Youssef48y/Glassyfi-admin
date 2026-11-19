import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'تأكيد الحذف',
  cancelText = 'إلغاء',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-box"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <AlertTriangle
              size={20}
              color={danger ? 'var(--danger)' : 'var(--accent)'}
            />
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={busy}
            onClick={onCancel}
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'جاري التنفيذ...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
