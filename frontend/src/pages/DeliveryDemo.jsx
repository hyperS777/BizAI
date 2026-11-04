import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Download,
  FileText, MapPin, Navigation, Package, PackageCheck, Phone,
  RotateCcw, Scan, Truck, Upload, XCircle,
} from 'lucide-react';
import client from '../api/client';
import { apiError, money } from '../utils/format';
import './DeliveryDemo.css';

/* Simplified 3-stage flow: ready_to_pack → out_for_delivery → delivered */
const stages = [
  { id: 'ready_to_pack', label: 'Ready to pack', icon: Package, emoji: '📦' },
  { id: 'packed', label: 'Packed', icon: PackageCheck, emoji: '✅' },
  { id: 'out_for_delivery', label: 'Out for delivery', icon: Truck, emoji: '🚚' },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle2, emoji: '🏠' },
];

/* Route nodes: Warehouse → Out for delivery → Customer */
const routeNodes = [
  { label: 'Warehouse', emoji: '🏭', id: 'warehouse' },
  { label: 'Out for delivery', emoji: '🚚', id: 'out_for_delivery' },
  { label: 'Customer', emoji: '🏠', id: 'customer_door' },
];

const statusToRouteIndex = {
  ready_to_pack: 0,
  packed: 0,
  out_for_delivery: 1,
  failed_delivery: 1,
  delivered: 2,
  returned_to_store: 0,
};

const nextStates = {
  ready_to_pack: [{ status: 'packed', label: 'Mark packed' }],
  packed: [{ status: 'out_for_delivery', label: 'Start delivery run' }],
  out_for_delivery: [
    { status: 'delivered', label: 'Confirm delivery ✓' },
    { status: 'failed_delivery', label: 'Log failed attempt' },
  ],
  failed_delivery: [
    { status: 'out_for_delivery', label: 'Retry delivery' },
    { status: 'returned_to_store', label: 'Return to store' },
  ],
  delivered: [],
  returned_to_store: [],
};

const STATUS_LABELS = {
  ready_to_pack: 'Ready to pack',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  failed_delivery: 'Failed attempt',
  delivered: 'Delivered ✓',
  returned_to_store: 'Returned to store',
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

function statusEmoji(status) {
  const map = {
    ready_to_pack: '📦', packed: '✅', out_for_delivery: '🚚',
    delivered: '🏠', failed_delivery: '❌', returned_to_store: '↩️', Warehouse: '🏭',
  };
  return map[status] || '📍';
}

/* Delhi static map using OpenStreetMap tile */
function DeliveryMapStatic({ delivery }) {
  // Delhi coordinates: 28.6139, 77.2090
  const lat = delivery?.delivery_latitude ?? 28.6139;
  const lng = delivery?.delivery_longitude ?? 77.2090;
  const zoom = 13;
  const mapsUrl = delivery?.delivery_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.delivery_address)}`
    : `https://maps.google.com/?q=${lat},${lng}`;
  const tileUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=640x220&markers=${lat},${lng},red`;

  return (
    <div className="delivery-map-static">
      <div className="delivery-map-frame-static">
        <div className="delivery-map-placeholder">
          <MapPin size={28} />
          <div>
            <strong>{delivery?.current_location || 'REIHH Delhi Warehouse'}</strong>
            <small>{lat.toFixed(4)}°N, {lng.toFixed(4)}°E</small>
          </div>
        </div>
        <a className="delivery-directions" href={mapsUrl} target="_blank" rel="noreferrer">
          <Navigation size={15} /> Open in Google Maps <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

/* Invoice panel shown after delivery */
function InvoicePanel({ delivery }) {
  if (!delivery?.invoice_number) return null;
  return (
    <div className="invoice-ready-panel">
      <div className="invoice-ready-icon"><FileText size={28} /></div>
      <div className="invoice-ready-body">
        <strong>Invoice ready</strong>
        <span>Invoice #{delivery.invoice_number} · Order successfully delivered</span>
        <p>Your invoice has been generated and marked as paid. Download or share it below.</p>
      </div>
      <div className="invoice-ready-actions">
        {delivery.invoice_token && (
          <a
            className="delivery-primary-action invoice-btn"
            href={`/invoices/${delivery.invoice_token}`}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={15} /> View invoice
          </a>
        )}
        <span className="invoice-status-badge">
          <Check size={13} /> {delivery.invoice_status || 'paid'}
        </span>
      </div>
    </div>
  );
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

  /* Auto-refresh every 15s while not delivered */
  useEffect(() => {
    if (!delivery || delivery.delivery_status === 'delivered' || delivery.delivery_status === 'returned_to_store') return undefined;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [delivery?.delivery_status]);

  const stageIndex = useMemo(
    () => stages.findIndex((s) => s.id === delivery?.delivery_status),
    [delivery],
  );
  const routeIndex = statusToRouteIndex[delivery?.delivery_status] ?? 0;

  const checkpointLog = delivery?.checkpoint_log || [];
  const isDelivered = delivery?.delivery_status === 'delivered';

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
      setMessage(`Status updated to: ${STATUS_LABELS[status] || status}.`);
      if (status === 'delivered') {
        showToast('🎉 Delivery complete! Invoice generated and sent to customer.');
      } else {
        showToast('Customer notified · Demo only');
      }
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

  if (loading) return <main className="delivery-demo loading"><Package size={24} /><span>Loading delivery demo…</span></main>;
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
        <a className="delivery-demo-brand" href="/store/demo">REIHH <span>DELIVERY</span></a>
        <span className="demo-only-badge"><span /> Simulated delivery — no real GPS</span>
      </header>

      <div className="delivery-demo-body">
        <a className="delivery-back" href="/store/demo"><ArrowLeft size={15} /> Customer preview</a>

        {/* Hero */}
        <section className="delivery-hero">
          <div>
            <p className="delivery-kicker">Delivery run</p>
            <h1>#{delivery.reference}</h1>
            <p className="delivery-customer">For <strong>{delivery.customer_name}</strong></p>
            <p className="delivery-addr-short">{delivery.delivery_address}</p>
          </div>
          <span className={`delivery-status-chip ${delivery.delivery_status}`}>
            {STATUS_LABELS[delivery.delivery_status] || delivery.delivery_status.replaceAll('_', ' ')}
          </span>
        </section>

        {/* Route visualiser - simplified 3 nodes */}
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

        {/* Delivery stages timeline */}
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

        {/* Invoice panel on delivery */}
        {isDelivered && <InvoicePanel delivery={delivery} />}

        <div className="delivery-demo-grid">
          {/* Map / location */}
          <section className="delivery-section delivery-destination">
            <div className="delivery-section-heading">
              <div>
                <p className="delivery-kicker">Destination</p>
                <h2>Customer address</h2>
              </div>
              <MapPin size={19} />
            </div>
            <DeliveryMapStatic delivery={delivery} />
            <p className="delivery-addr-full">{delivery.delivery_address}</p>
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
                    <span>{statusEmoji(entry.agent_name === 'Warehouse' ? 'Warehouse' : entry.status)}</span>
                  </div>
                  <div className="checkpoint-body">
                    <strong>{entry.label}</strong>
                    <span>{STATUS_LABELS[entry.status] || entry.status?.replaceAll('_', ' ')}</span>
                    {entry.agent_name && <span className="checkpoint-agent">by {entry.agent_name}</span>}
                    {entry.note && <em>{entry.note}</em>}
                    <small>{relativeTime(entry.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick actions */}
        {!isDelivered && (
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
        )}

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
              disabled={isDelivered}
            />
          </label>
          {!isDelivered && (
            <label className="delivery-field">
              Delivery note <span className="optional-label">Optional</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Add a note for this demo run…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    const actions = nextStates[delivery.delivery_status] || [];
                    if (actions.length === 1) { e.preventDefault(); updateStatus(actions[0].status); }
                  }
                }}
              />
            </label>
          )}
          {!isDelivered && <p className="keyboard-hint">Press Enter in notes to trigger the primary action.</p>}
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
              {isDelivered
                ? '🎉 Delivery complete! Invoice has been generated for this order.'
                : 'This demo delivery is complete. No further agent actions are available.'}
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
