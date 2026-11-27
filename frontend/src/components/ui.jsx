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

export function ChannelBadge({ channel, compact = false }) {
  const isDemo = String(channel || '').toLowerCase() === 'demo';
  return (
    <span
      className={`channel-badge ${isDemo ? 'demo' : 'real'}${compact ? ' compact' : ''}`}
      title={isDemo ? 'Demo / Simulated Payment' : 'Actual Business Payment'}
    >
      {isDemo ? 'DEMO' : 'ACTUAL'}
    </span>
  );
}

export function PaymentSplit({ actual = 0, demo = 0, format = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` }) {
  return (
    <div className="payment-split-row">
      <span className="split-chip real">
        <span className="split-dot real" /> Actual: <b>{format(actual)}</b>
      </span>
      <span className="split-chip demo">
        <span className="split-dot demo" /> Demo: <b>{format(demo)}</b>
      </span>
    </div>
  );
}

export function ChannelFilter({ value, onChange, counts }) {
  const items = [
    { id: 'all', label: 'All Payments', count: counts?.all },
    { id: 'real', label: 'Actual (Real)', count: counts?.real },
    { id: 'demo', label: 'Demo Only', count: counts?.demo },
  ];
  return (
    <div className="channel-filter-group" role="group" aria-label="Filter by payment channel">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`segment-pill channel-pill-${item.id} ${value === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span>
          {item.count !== undefined && <span className="channel-count">{item.count}</span>}
        </button>
      ))}
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
