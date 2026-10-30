import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3,
  MapPin, Navigation, Package, PackageCheck, Phone,
  RotateCcw, Scan, Truck, Upload, XCircle,
} from 'lucide-react';
import client from '../api/client';
import { apiError, money } from '../utils/format';
import './DeliveryDemo.css';

const stages = [
  { id: 'ready_to_pack', label: 'Ready to pack', icon: Package, emoji: '📦' },
  { id: 'packed', label: 'Packed', icon: PackageCheck, emoji: '✅' },
  { id: 'picked_up', label: 'Picked up', icon: Truck, emoji: '🚚' },
  { id: 'out_for_delivery', label: 'Out for delivery', icon: Navigation, emoji: '📍' },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle2, emoji: '🏠' },
];

const routeNodes = [
  { label: 'Warehouse', emoji: '🏭', id: 'warehouse' },
  { label: 'Sorting hub', emoji: '🔃', id: 'sorting_hub' },
  { label: 'City hub', emoji: '🏙️', id: 'city_hub' },
  { label: 'Out for delivery', emoji: '🚚', id: 'out_for_delivery' },
  { label: 'Customer', emoji: '🏠', id: 'customer_door' },
];

const statusToRouteIndex = {
  ready_to_pack: 0,
  packed: 0,
  picked_up: 1,
  out_for_delivery: 3,
  failed_delivery: 2,
  delivered: 4,
  returned_to_store: 0,
};

const nextStates = {
  ready_to_pack: [{ status: 'packed', label: 'Mark packed' }],
  packed: [{ status: 'picked_up', label: 'Confirm pickup' }],
  picked_up: [{ status: 'out_for_delivery', label: 'Start delivery' }],
  out_for_delivery: [
    { status: 'delivered', label: 'Confirm delivery' },
    { status: 'failed_delivery', label: 'Log failed attempt' },
  ],
  failed_delivery: [
    { status: 'out_for_delivery', label: 'Retry delivery' },
    { status: 'returned_to_store', label: 'Return to store' },
  ],
  delivered: [],
  returned_to_store: [],
};

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CheckpointIcon({ status }) {
  const icons = {
    ready_to_pack: '📦', packed: '✅', picked_up: '🚚',
    out_for_delivery: '📍', delivered: '🏠', failed_delivery: '❌',
    returned_to_store: '↩️', Warehouse: '🏭',
  };
  return <span>{icons[status] || '📍'}</span>;
}

export default function DeliveryDemo() {
  const { token } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [agentName, setAgentName] = useState(() => localStorage.getItem('reihh-demo-agent') || '');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  /* ── Toast ── */
  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  /* ── Modals ── */
  const [qrModal, setQrModal] = useState(false);
  const [qrScanned, setQrScanned] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [dialerModal, setDialerModal] = useState(false);

  const load = () => client.get(`/storefront/demo-delivery/${token}`)
    .then(({ data }) => setDelivery(data))
    .catch((err) => setError(apiError(err, 'This delivery link is invalid or expired.')))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const stageIndex = useMemo(
    () => stages.findIndex((s) => s.id === delivery?.delivery_status),
    [delivery],
  );
  const routeIndex = statusToRouteIndex[delivery?.delivery_status] ?? 0;

  const directionsUrl = delivery?.delivery_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.delivery_address)}`
    : null;

  const checkpointLog = delivery?.checkpoint_log || [];

  const updateStatus = async (status) => {
    if (!agentName.trim()) {
      setError('Enter your agent name before updating this demo delivery.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      localStorage.setItem('reihh-demo-agent', agentName.trim());
      const { data } = await client.patch(`/storefront/demo-delivery/${token}`, {
        status,
        agent_name: agentName.trim(),
        note: note.trim() || null,
      });
      setDelivery(data);
      setNote('');
      setMessage(`Delivery updated to: ${status.replaceAll('_', ' ')}.`);
      showToast('Customer notified via SMS · Demo only');
    } catch (err) {
      setError(apiError(err, 'Could not update demo delivery.'));
    } finally {
      setBusy(false);
    }
  };

  /* ── QR scanner simulation ── */
  const doQrScan = () => {
    setQrModal(true);
    setQrScanned(false);
    setTimeout(() => setQrScanned(true), 1800);
  };
  const closeQr = () => { setQrModal(false); setQrScanned(false); };

  /* ── Upload simulation ── */
  const doUpload = () => {
    setUploadModal(true);
    setUploadDone(false);
    setTimeout(() => setUploadDone(true), 1500);
  };
  const closeUpload = () => { setUploadModal(false); setUploadDone(false); };

  if (loading) return <main className="delivery-demo loading">Loading delivery demo…</main>;
  if (!delivery) return (
    <main className="delivery-demo">
      <div className="delivery-demo-error">
        <XCircle size={24} />
        <h1>Delivery link unavailable</h1>
        <p>{error}</p>
        <a href="/store/demo"><ArrowLeft size={15} /> Return to customer demo</a>
      </div>
    </main>
  );

  return (
    <main className="delivery-demo">
      {/* Toast notification */}
      {toast && <div className="customer-notified-toast">{toast}</div>}

      {/* Header */}
      <header className="delivery-demo-header">
        <a className="delivery-demo-brand" href="/store/demo">REIHH <span>DEMO DELIVERY</span></a>
        <span className="demo-only-badge"><span /> Simulated delivery — no real GPS</span>
      </header>

      <div className="delivery-demo-body">
        <a className="delivery-back" href="/store/demo"><ArrowLeft size={15} /> Customer preview</a>

        {/* Hero */}
        <section className="delivery-hero">
          <div>
            <p className="delivery-kicker">Delivery run</p>
            <h1>#{delivery.reference}</h1>
            <p className="delivery-customer">For {delivery.customer_name}</p>
          </div>
          <span className={`delivery-status-chip ${delivery.delivery_status}`}>
            {delivery.delivery_status.replaceAll('_', ' ')}
          </span>
        </section>

        {/* Route visualiser */}
        <section className="route-visualizer" aria-label="Delivery route">
          {routeNodes.map((node, idx) => (
            <div key={node.id} className={`route-node ${idx <= routeIndex ? 'active' : ''} ${idx === routeIndex ? 'current' : ''}`}>
              <div className="route-node-dot">
                {idx === routeIndex && <span className="pulse-ring" />}
                <span className="route-node-emoji">{node.emoji}</span>
              </div>
              <span className="route-node-label">{node.label}</span>
              {idx < routeNodes.length - 1 && <div className={`route-connector ${idx < routeIndex ? 'done' : ''}`} />}
            </div>
          ))}
        </section>

        {/* Delivery timeline */}
        <section className="delivery-timeline" aria-label="Delivery progress">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const complete = stageIndex >= 0 && index <= stageIndex;
            const current = index === stageIndex;
            return (
              <div className={`delivery-stage ${complete ? 'complete' : ''} ${current ? 'current-stage' : ''}`} key={stage.id}>
                <span className="stage-mark"><Icon size={16} /></span>
                <span>{stage.label}</span>
                {index < stages.length - 1 && <i />}
              </div>
            );
          })}
        </section>

        <div className="delivery-demo-grid">
          {/* Destination */}
          <section className="delivery-section delivery-destination">
            <div className="delivery-section-heading">
              <div>
                <p className="delivery-kicker">Destination</p>
                <h2>Customer address</h2>
              </div>
              <MapPin size={19} />
            </div>
            <p>{delivery.delivery_address}</p>
            {directionsUrl && (
              <a className="delivery-directions" href={directionsUrl} target="_blank" rel="noreferrer">
                <Navigation size={15} /> Open directions <ArrowRight size={14} />
              </a>
            )}
            {delivery.delivery_agent_name && (
              <small className="agent-attribution">
                Last update by {delivery.delivery_agent_name}
                {delivery.updated_at ? ` · ${new Date(delivery.updated_at).toLocaleString('en-IN')}` : ''}
              </small>
            )}
          </section>

          {/* Items */}
          <section className="delivery-section">
            <div className="delivery-section-heading">
              <div>
                <p className="delivery-kicker">Parcel</p>
                <h2>Items in this run</h2>
              </div>
              <Package size={19} />
            </div>
            <div className="delivery-items">
              {delivery.items.map((item) => (
                <div className="delivery-item" key={`${item.variant_id}-${item.title}`}>
                  {item.image_url && <img src={item.image_url} alt="" />}
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.variant_title} · Qty {item.quantity}</small>
                  </span>
                  <b>{money(item.line_total)}</b>
                </div>
              ))}
            </div>
            <div className="delivery-total">
              <span>Simulation total</span>
              <strong>{money(delivery.total_amount)}</strong>
            </div>
          </section>
        </div>

        {/* Checkpoint log */}
        {checkpointLog.length > 0 && (
          <section className="delivery-section checkpoint-log-section">
            <div className="delivery-section-heading">
              <div>
                <p className="delivery-kicker">Activity</p>
                <h2>Checkpoint log</h2>
              </div>
              <Clock3 size={19} />
            </div>
            <div className="checkpoint-timeline">
              {checkpointLog.map((entry, i) => (
                <div className="checkpoint-entry" key={i}>
                  <div className="checkpoint-icon">
                    <CheckpointIcon status={entry.agent_name === 'Warehouse' ? 'Warehouse' : entry.status} />
                  </div>
                  <div className="checkpoint-body">
                    <strong>{entry.label}</strong>
                    <span>{entry.agent_name}</span>
                    {entry.note && <em>{entry.note}</em>}
                    <small>{relativeTime(entry.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section className="delivery-section quick-actions-panel">
          <div className="delivery-section-heading">
            <div>
              <p className="delivery-kicker">Tools</p>
              <h2>Quick actions</h2>
            </div>
          </div>
          <div className="quick-action-buttons">
            <button className="quick-action-btn" onClick={doQrScan}>
              <Scan size={18} /> Scan QR code
            </button>
            <button className="quick-action-btn" onClick={doUpload}>
              <Upload size={18} /> Upload proof
            </button>
            <button className="quick-action-btn" onClick={() => setDialerModal(true)}>
              <Phone size={18} /> Call customer
            </button>
          </div>
        </section>

        {/* Agent controls */}
        <section className="delivery-agent-controls">
          <div className="delivery-section-heading">
            <div>
              <p className="delivery-kicker">Agent actions</p>
              <h2>Update this delivery</h2>
            </div>
            <Clock3 size={19} />
          </div>
          <label className="delivery-field">
            Agent name
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <label className="delivery-field">
            Delivery note <span className="optional-label">Optional</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Add a note for this demo run (press Enter to submit action)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  const actions = nextStates[delivery.delivery_status] || [];
                  if (actions.length === 1) { e.preventDefault(); updateStatus(actions[0].status); }
                }
              }}
            />
          </label>
          <p className="keyboard-hint">Press Enter in the notes field to submit the primary action.</p>
          {error && <p className="delivery-error">{error}</p>}
          {message && <p className="delivery-success"><Check size={15} /> {message}</p>}
          <div className="delivery-actions">
            {(nextStates[delivery.delivery_status] || []).map((action) => (
              <button
                key={action.status}
                className={
                  action.status === 'failed_delivery' || action.status === 'returned_to_store'
                    ? 'delivery-secondary-action'
                    : 'delivery-primary-action'
                }
                disabled={busy}
                onClick={() => updateStatus(action.status)}
              >
                {action.status === 'failed_delivery' ? <XCircle size={16} />
                  : action.status === 'delivered' ? <CheckCircle2 size={16} />
                    : action.status === 'out_for_delivery' ? <Truck size={16} />
                      : action.status === 'returned_to_store' ? <RotateCcw size={16} />
                        : <Check size={16} />}
                {busy ? 'Saving…' : action.label}
              </button>
            ))}
          </div>
          {nextStates[delivery.delivery_status]?.length === 0 && (
            <p className="delivery-terminal-state">
              This demo delivery is complete. No further agent actions are available.
            </p>
          )}
        </section>

        <p className="delivery-demo-disclaimer">
          Training simulation only. This is not a real order, payment, shipment, or customer GPS location.
        </p>
      </div>

      {/* QR scanner modal */}
      {qrModal && (
        <div className="modal-overlay" onClick={closeQr}>
          <div className="qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qr-viewport">
              <div className="qr-corner qr-corner-tl" />
              <div className="qr-corner qr-corner-tr" />
              <div className="qr-corner qr-corner-bl" />
              <div className="qr-corner qr-corner-br" />
              {qrScanned
                ? <div className="qr-result"><Check size={28} /> Package scanned<br /><small>REIHH-{delivery.reference}</small></div>
                : <div className="qr-scanning-line" />
              }
            </div>
            <p className="qr-status">{qrScanned ? 'Scan successful!' : 'Scanning…'}</p>
            <button className="qr-close-btn" onClick={closeQr}>
              {qrScanned ? 'Done' : 'Cancel'} <XCircle size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Upload proof modal */}
      {uploadModal && (
        <div className="modal-overlay" onClick={closeUpload}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="upload-camera-view">
              {uploadDone
                ? <div className="upload-done"><Check size={32} /><p>Proof uploaded</p><small>Delivery confirmed</small></div>
                : <div className="upload-capturing"><span className="upload-spinner" /><p>Uploading…</p></div>
              }
            </div>
            <button className="qr-close-btn" onClick={closeUpload}>
              {uploadDone ? 'Done' : 'Cancel'} <XCircle size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Dialer modal */}
      {dialerModal && (
        <div className="modal-overlay" onClick={() => setDialerModal(false)}>
          <div className="dialer-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Call customer</h3>
            <p className="dialer-name">{delivery.customer_name}</p>
            <p className="dialer-number">+91 98765 XXXXX</p>
            <p className="dialer-note">Demo only — no real call will be made.</p>
            <div className="dialer-actions">
              <button className="delivery-primary-action" onClick={() => setDialerModal(false)}>
                <Phone size={16} /> Call (Demo)
              </button>
              <button className="delivery-secondary-action" onClick={() => setDialerModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
