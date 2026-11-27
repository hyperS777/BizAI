import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Package, Search, Truck } from 'lucide-react';
import client from '../api/client';
import { ChannelBadge } from '../components/ui';
import { formatDate, money } from '../utils/format';

const STATUS_DISPLAY = {
  draft: 'Draft',
  pending: 'Order Placed (Pending Confirmation)',
  confirmed: 'Confirmed & Packed at Okhla DC',
  shipped: 'In Transit via Delhivery Express',
  delivered: 'Delivered',
  returned: 'Returned to Origin',
  cancelled: 'Cancelled',
};

const STEPS = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed & Packed' },
  { key: 'shipped', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

export default function TrackOrder() {
  const { trackingNumber: routeRef } = useParams();
  const [query, setQuery] = useState(routeRef || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTracking = async (ref) => {
    const clean = (ref || '').trim().replace(/^#/, '');
    if (!clean) return;
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/storefront/tracking/${encodeURIComponent(clean)}`);
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.detail || 'No order or Delhivery AWB found for that reference.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeRef) {
      setQuery(routeRef);
      fetchTracking(routeRef);
    }
  }, [routeRef]);

  const currentIdx = STEPS.findIndex((s) => s.key === data?.status);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg, #f7f6f2)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Link to="/store" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
            <ArrowLeft size={15} /> Back to REIHH Store
          </Link>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Delhivery Express &amp; Order Status</span>
        </div>

        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow" style={{ color: 'var(--teal)' }}>Order Tracking</p>
          <h1 style={{ margin: '4px 0 6px', fontSize: 24 }}>Track your REIHH Studio shipment</h1>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Enter your Order Number (e.g. <code>ORD-REIHH-001</code>) or Delhivery AWB Waybill (e.g. <code>148...</code>).
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); fetchTracking(query); }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Order # or Delhivery AWB…"
              style={{ flex: 1 }}
            />
            <button className="primary-btn" type="submit" disabled={loading || !query.trim()}>
              <Search size={15} /> {loading ? 'Searching…' : 'Track'}
            </button>
          </form>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
        </section>

        {data && (
          <section className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div>
                <span className="eyebrow">Order #{data.order_number}</span>
                <h2 style={{ margin: '2px 0 4px', fontSize: 20 }}>{STATUS_DISPLAY[data.status] || data.status}</h2>
                <small className="muted">
                  Carrier: <strong>{data.tracking_company || 'Delhivery Express'}</strong>
                  {data.tracking_number ? ` · AWB: ${data.tracking_number}` : ''}
                </small>
              </div>
              <span className={`status-pill ${data.status}`} style={{ fontSize: 12, padding: '5px 12px' }}>
                {data.status === 'shipped' ? 'In Transit' : data.status}
              </span>
            </div>

            {['pending', 'confirmed', 'shipped', 'delivered'].includes(data.status) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '18px 0' }}>
                {STEPS.map((step, i) => {
                  const done = currentIdx >= i;
                  return (
                    <div
                      key={step.key}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${done ? 'var(--teal)' : 'var(--border)'}`,
                        background: done ? 'rgba(14,118,110,0.08)' : 'var(--panel-alt)',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: done ? 'var(--teal)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {done ? <CheckCircle2 size={13} /> : <Clock3 size={13} />} Step {i + 1}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>{step.label}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={13} /> Current Location &amp; Destination
                </div>
                <strong style={{ display: 'block', marginTop: 4 }}>{data.location || 'Delhi NCR Hub'}</strong>
                {data.shipping_address && <small className="muted" style={{ display: 'block', marginTop: 2 }}>{data.shipping_address}</small>}
                {data.updated_at && <small className="muted" style={{ display: 'block', marginTop: 4 }}>Updated: {formatDate(data.updated_at)}</small>}
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Package size={13} /> Parcel Summary
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <strong>{money(data.total_amount)}</strong>
                  <ChannelBadge channel={data.channel} compact />
                </div>
                {(data.items || []).map((item, idx) => (
                  <small key={idx} style={{ display: 'block', marginTop: 2, color: 'var(--muted)' }}>
                    {item.quantity}x {item.name} {item.option2 ? `(${item.option2})` : ''}
                  </small>
                ))}
              </div>
            </div>

            {data.checkpoints?.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Truck size={15} style={{ color: 'var(--teal)' }} /> Courier Scan History
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.checkpoints.slice().reverse().map((cp, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '8px 10px', borderRadius: 6, background: 'var(--panel-alt)' }}>
                      <div>
                        <strong>{cp.label || 'Checkpoint'}</strong>
                        <span className="muted"> · {String(cp.status || '').replaceAll('_', ' ')}</span>
                        {cp.note && <div className="muted" style={{ fontSize: 11.5 }}>{cp.note}</div>}
                      </div>
                      <small className="muted">{cp.at ? formatDate(cp.at) : ''}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
