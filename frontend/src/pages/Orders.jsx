import { useEffect, useMemo, useState } from 'react';
import {
  MapPin, MapPinned, ClipboardList, List, ChevronDown, ChevronRight,
  Package, FileText, ExternalLink, Truck,
} from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const statusTabs = [
  { id: 'all', label: 'All orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'shipped', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

function MapBounds({ orders }) {
  const map = useMap();
  useEffect(() => {
    const points = orders
      .filter((order) => Number.isFinite(order.delivery_latitude) && Number.isFinite(order.delivery_longitude))
      .map((order) => [order.delivery_latitude, order.delivery_longitude]);
    if (points.length > 1) map.fitBounds(points, { padding: [34, 34], maxZoom: 12 });
    else if (points.length === 1) map.setView(points[0], 11);
    else map.setView([28.6139, 77.2090], 11); // Default to Delhi
  }, [map, orders]);
  return null;
}

/* Expandable order row */
function OrderRow({ order, canStatus, canInvoice, onChangeStatus, onInvoice }) {
  const [expanded, setExpanded] = useState(false);

  const itemsSummary = order.items?.length
    ? order.items.map((i) => `${i.product?.name || 'Product'} ×${i.quantity}`).join(', ')
    : '—';

  return (
    <>
      <tr
        className={`order-data-row ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded((x) => !x)}
      >
        <td>
          <span className="order-expand-icon">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <strong>#{order.order_number}</strong>
        </td>
        <td>
          <div className="order-customer-cell">
            <strong>{order.customer?.name || `Customer #${order.customer_id}`}</strong>
            {order.customer?.email && <small>{order.customer.email}</small>}
          </div>
        </td>
        <td>
          {canStatus ? (
            <select
              value={order.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); onChangeStatus(order, e.target.value); }}
            >
              {[order.status, ...(order.allowed_next_statuses || [])].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <option key={v} value={v}>{v.replace('_', ' ')}</option>
              ))}
            </select>
          ) : (
            <span className={`status-pill ${order.status}`}>{order.status}</span>
          )}
        </td>
        <td className="delivery-cell">
          {order.tracking_url
            ? <a href={order.tracking_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{order.tracking_company || 'Track'} <ExternalLink size={11} /></a>
            : order.tracking_number || (order.status === 'shipped' ? 'Awaiting carrier' : '—')}
          {order.delivery_location && <small>{order.delivery_location}</small>}
        </td>
        <td><strong>{money(order.total_amount)}</strong></td>
        <td>{formatDate(order.created_at)}</td>
        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
          {canInvoice && !order.invoice && (
            <button className="text-btn" onClick={() => onInvoice(order)}>Invoice</button>
          )}
          {order.invoice && <span className="status-pill delivered" style={{ fontSize: 11 }}>Invoiced</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="order-detail-row">
          <td colSpan={7}>
            <div className="order-detail-panel">
              {/* Items */}
              <div className="order-detail-section">
                <div className="order-detail-heading"><Package size={14} /> Items</div>
                <div className="order-detail-items">
                  {order.items?.length ? order.items.map((item, i) => (
                    <div className="order-detail-item" key={i}>
                      {item.product?.image_url && (
                        <img src={item.product.image_url} alt="" className="order-item-thumb" />
                      )}
                      <div>
                        <strong>{item.product?.name || `Product #${item.product_id}`}</strong>
                        {item.variant && <small>{item.variant.option1}{item.variant.option2 ? ` / ${item.variant.option2}` : ''}</small>}
                        <span>Qty: {item.quantity} · {money(item.unit_price || item.product?.price || 0)} each</span>
                      </div>
                      <b>{money((item.unit_price || item.product?.price || 0) * item.quantity)}</b>
                    </div>
                  )) : <span className="muted">No item details available</span>}
                </div>
              </div>

              {/* Delivery info */}
              <div className="order-detail-section">
                <div className="order-detail-heading"><Truck size={14} /> Delivery</div>
                <div className="order-detail-meta">
                  {order.shipping_address && <span><strong>Address:</strong> {order.shipping_address}</span>}
                  {order.tracking_company && <span><strong>Carrier:</strong> {order.tracking_company}</span>}
                  {order.tracking_number && <span><strong>Tracking #:</strong> {order.tracking_number}</span>}
                  {order.delivery_location && <span><strong>Last location:</strong> {order.delivery_location}</span>}
                  {order.delivery_updated_at && <span><strong>Updated:</strong> {formatDate(order.delivery_updated_at)}</span>}
                  {order.tracking_url && (
                    <a className="text-btn" href={order.tracking_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Open delivery tracking
                    </a>
                  )}
                </div>
              </div>

              {/* Order meta */}
              <div className="order-detail-section">
                <div className="order-detail-heading"><FileText size={14} /> Order info</div>
                <div className="order-detail-meta">
                  {order.notes && <span><strong>Notes:</strong> {order.notes}</span>}
                  {order.discount_code && <span><strong>Discount code:</strong> {order.discount_code}</span>}
                  {order.discount_amount > 0 && <span><strong>Discount amount:</strong> −{money(order.discount_amount)}</span>}
                  <span><strong>Subtotal:</strong> {money(order.subtotal_amount || order.total_amount)}</span>
                  <span><strong>Total:</strong> {money(order.total_amount)}</span>
                  {order.invoice && (
                    <span>
                      <strong>Invoice:</strong> {order.invoice.invoice_number}
                      {' '}
                      <span className={`status-pill ${order.invoice.status}`}>{order.invoice.status}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Orders() {
  const { can } = useAuth();
  const canCreate = can(['admin', 'manager', 'employee']);
  const canStatus = can(['admin', 'manager']);
  const canInvoice = can(['admin', 'manager', 'accountant']);
  const canSeeSimulations = can(['admin', 'manager']);
  const [orders, setOrders] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('orders');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ customer_id: '', notes: '', items: [{ product_id: '', quantity: 1 }] });

  const load = () => {
    client.get('/orders', { params: { limit: 250 } })
      .then((res) => setOrders(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    client.get('/customers').then((res) => setCustomers(res.data || []));
    client.get('/products').then((res) => setProducts(res.data || []));
  }, []);

  useEffect(() => {
    if (canSeeSimulations) client.get('/storefront/simulations').then((res) => setSimulations(res.data || [])).catch(() => {});
  }, [canSeeSimulations]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (view !== 'map') return undefined;
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [view]);

  const statusCounts = useMemo(() => orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    counts.all += 1;
    return counts;
  }, { all: 0 }), [orders]);

  const tabs = canSeeSimulations ? [...statusTabs, { id: 'simulations', label: 'Simulations' }] : statusTabs;
  const visibleOrders = useMemo(() => status === 'all' ? orders : orders.filter((order) => order.status === status), [orders, status]);
  const mappedOrders = useMemo(() => visibleOrders.filter((order) => (
    order.status !== 'cancelled'
    && Number.isFinite(order.delivery_latitude)
    && Number.isFinite(order.delivery_longitude)
  )), [visibleOrders]);

  const addLine = () => setForm({ ...form, items: [...form.items, { product_id: '', quantity: 1 }] });
  const total = form.items.reduce((sum, item) => {
    const product = products.find((p) => String(p.id) === String(item.product_id));
    return sum + (product ? product.price * Number(item.quantity || 0) : 0);
  }, 0);

  const save = async (event) => {
    event.preventDefault();
    try {
      await client.post('/orders', {
        customer_id: Number(form.customer_id),
        notes: form.notes || null,
        items: form.items
          .filter((item) => item.product_id)
          .map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
      });
      setModal(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create order'));
    }
  };

  const changeStatus = async (order, next) => {
    try {
      await client.patch(`/orders/${order.id}/status`, { status: next });
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update status'));
    }
  };

  const invoice = async (order) => {
    try {
      await client.post(`/invoices/from-order/${order.id}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not generate invoice'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Create orders, confirm them to deduct stock, and raise invoices.">
        {canCreate && <button className="primary-btn heading-btn" onClick={() => setModal(true)}>New order</button>}
      </PageHeader>
      <div className="orders-toolbar">
        <div className="order-status-tabs" role="tablist" aria-label="Filter orders by status">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={status === tab.id} className={status === tab.id ? 'order-tab active' : 'order-tab'} onClick={() => { setStatus(tab.id); if (tab.id === 'simulations') setView('orders'); }}>
              {tab.label}<span>{tab.id === 'simulations' ? simulations.length : statusCounts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="order-view-toggle" role="group" aria-label="Order view">
          <button type="button" className={view === 'orders' ? 'active' : ''} aria-label="Orders list" title="Orders list" onClick={() => setView('orders')}><List size={17} /></button>
          <button type="button" disabled={status === 'simulations'} className={view === 'map' ? 'active' : ''} aria-label="Delivery map" title="Delivery map" onClick={() => setView('map')}><MapPinned size={17} /></button>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      {status === 'simulations' ? simulations.length ? (
        <section className="panel table-panel order-table-panel simulation-table-panel">
          <table className="data-table">
            <thead><tr><th>Simulation</th><th>Customer</th><th>Items</th><th>Total</th><th>Created</th><th>Delivery</th></tr></thead>
            <tbody>{simulations.map((sim) => (
              <tr key={sim.id}>
                <td><strong>{sim.reference}</strong></td>
                <td>
                  <div className="order-customer-cell">
                    <strong>{sim.customer_name}</strong>
                    <small>{sim.customer_email}</small>
                  </div>
                </td>
                <td><small>{sim.items?.map((item) => `${item.title} × ${item.quantity}`).join(', ')}</small></td>
                <td>{money(sim.total_amount)}</td>
                <td>{formatDate(sim.created_at)}</td>
                <td>
                  <span className={`status-pill ${sim.delivery_status || 'pending'}`}>
                    {sim.delivery_status?.replaceAll('_', ' ') || 'ready to pack'}
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : <EmptyState icon={ClipboardList} text="No customer simulations recorded yet." /> : view === 'map' ? (
        <section className="delivery-map-panel panel">
          <div className="delivery-map-heading">
            <div><p className="eyebrow">Live fulfillment</p><h2>Delivery map</h2><p className="muted">Delhi NCR region · Carrier positions refresh every 30 seconds.</p></div>
            <span className="map-count"><MapPin size={15} /> {mappedOrders.length} tracked</span>
          </div>
          <div className="delivery-map-frame">
            {/* Default center is Delhi */}
            <MapContainer center={[28.6139, 77.2090]} zoom={10} minZoom={3} scrollWheelZoom className="delivery-map" zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="bottomright" />
              <MapBounds orders={mappedOrders} />
              {mappedOrders.map((order) => (
                <CircleMarker key={order.id} center={[order.delivery_latitude, order.delivery_longitude]} radius={8} pathOptions={{ color: STATUS_COLORS[order.status] || '#507fa0', fillColor: STATUS_COLORS[order.status] || '#507fa0', fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>#{order.order_number}</strong><br />
                    {order.customer?.name || 'Customer'}<br />
                    <span>{order.status.replace('_', ' ')}</span><br />
                    {order.delivery_location && <><small>{order.delivery_location}</small><br /></>}
                    {order.tracking_url && <><a href={order.tracking_url} target="_blank" rel="noreferrer">Track delivery</a></>}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          {mappedOrders.length === 0 && <div className="map-empty"><MapPin size={18} /><span><strong>No carrier locations yet</strong><small>Demo orders with delivery tracking will show here as pins on the Delhi NCR map.</small></span></div>}
          {mappedOrders.length > 0 && <div className="map-order-list">{mappedOrders.slice(0, 8).map((order) => <div className="map-order-row" key={order.id}><span className="status-dot" style={{ background: STATUS_COLORS[order.status] }} /><strong>#{order.order_number}</strong><span>{order.customer?.name || 'Customer'}</span><small>{order.delivery_location || order.tracking_company || 'Position received'}</small><span>{order.delivery_updated_at ? formatDate(order.delivery_updated_at) : ''}</span></div>)}</div>}
        </section>
      ) : visibleOrders.length ? (
        <section className="panel table-panel order-table-panel">
          <table className="data-table orders-expandable-table">
            <thead>
              <tr>
                <th style={{ width: '16%' }}>Order</th>
                <th style={{ width: '20%' }}>Customer</th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '22%' }}>Delivery</th>
                <th style={{ width: '12%' }}>Total</th>
                <th style={{ width: '10%' }}>Date</th>
                <th style={{ width: '6%', textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  canStatus={canStatus}
                  canInvoice={canInvoice}
                  onChangeStatus={changeStatus}
                  onInvoice={invoice}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={ClipboardList} text={status === 'all' ? 'No orders recorded yet.' : `No ${status.replace('_', ' ')} orders.`} />}

      {modal && (
        <Modal title="Create order" onClose={() => setModal(false)}>
          <form className="stack-form" onSubmit={save}>
            <label>Customer
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            {form.items.map((item, index) => (
              <div className="line-item" key={index}>
                <select value={item.product_id} onChange={(e) => {
                  const items = [...form.items];
                  items[index] = { ...item, product_id: e.target.value };
                  setForm({ ...form, items });
                }} required>
                  <option value="">Product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={(e) => {
                  const items = [...form.items];
                  items[index] = { ...item, quantity: e.target.value };
                  setForm({ ...form, items });
                }} />
              </div>
            ))}
            <button type="button" className="outline-btn" onClick={addLine}>Add line</button>
            <p><strong>Total {money(total)}</strong></p>
            <label>Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="primary-btn" type="submit">Create order</button>
          </form>
        </Modal>
      )}
    </>
  );
}
