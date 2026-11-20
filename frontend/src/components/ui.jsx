export function EmptyState({ icon: Icon, text }) {
  return (
    <div className="empty-state">
      {Icon ? <Icon size={22} /> : null}
      <span>{text}</span>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  isOpen,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div style={{ padding: '16px 20px', fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="outline-btn" type="button" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className="primary-btn"
            style={confirmVariant === 'danger' ? { background: '#ef4444', borderColor: '#ef4444', color: '#fff' } : {}}
            type="button"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
