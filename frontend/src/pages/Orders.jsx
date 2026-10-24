import { useEffect, useMemo, useState } from 'react';
import { MapPin, MapPinned, ClipboardList, List } from 'lucide-react';
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

function MapBounds({ orders }) {
  const map = useMap();
  useEffect(() => {
    const points = orders
      .filter((order) => Number.isFinite(order.delivery_latitude) && Number.isFinite(order.delivery_longitude))
      .map((order) => [order.delivery_latitude, order.delivery_longitude]);
    if (points.length > 1) map.fitBounds(points, { padding: [34, 34], maxZoom: 12 });
    else if (points.length === 1) map.setView(points[0], 11);
  }, [map, orders]);
  return null;
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
            <thead><tr><th>Simulation</th><th>Customer</th><th>Items</th><th>Total</th><th>Created</th><th>Payment</th></tr></thead>
            <tbody>{simulations.map((simulation) => <tr key={simulation.id}>
              <td><strong>{simulation.reference}</strong></td>
              <td>{simulation.customer_name}<small>{simulation.customer_email}</small></td>
              <td>{simulation.items.map((item) => `${item.title} · ${item.variant_title} × ${item.quantity}`).join(', ')}</td>
              <td>{money(simulation.total_amount)}</td>
              <td>{formatDate(simulation.created_at)}</td>
              <td><span className="status-pill simulation-only">No payment</span></td>
            </tr>)}</tbody>
          </table>
        </section>
      ) : <EmptyState icon={ClipboardList} text="No customer simulations recorded yet." /> : view === 'map' ? (
        <section className="delivery-map-panel panel">
          <div className="delivery-map-heading">
            <div><p className="eyebrow">Live fulfillment</p><h2>Delivery map</h2><p className="muted">Carrier positions refresh every 30 seconds when a tracking feed is connected.</p></div>
            <span className="map-count"><MapPin size={15} /> {mappedOrders.length} tracked</span>
          </div>
          <div className="delivery-map-frame">
            <MapContainer center={[22.9734, 78.6569]} zoom={5} minZoom={3} scrollWheelZoom className="delivery-map" zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="bottomright" />
              <MapBounds orders={mappedOrders} />
              {mappedOrders.map((order) => (
                <CircleMarker key={order.id} center={[order.delivery_latitude, order.delivery_longitude]} radius={8} pathOptions={{ color: order.status === 'delivered' ? '#0e766e' : '#507fa0', fillColor: order.status === 'delivered' ? '#0e766e' : '#507fa0', fillOpacity: 0.9 }}>
                  <Popup><strong>#{order.order_number}</strong><br />{order.customer?.name || 'Customer'}<br /><span>{order.status.replace('_', ' ')}</span>{order.tracking_url && <><br /><a href={order.tracking_url} target="_blank" rel="noreferrer">Carrier tracking</a></>}</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          {mappedOrders.length === 0 && <div className="map-empty"><MapPin size={18} /><span><strong>No carrier locations yet</strong><small>Connect a courier webhook to display live delivery positions. Orders will not be geocoded from customer addresses.</small></span></div>}
          {mappedOrders.length > 0 && <div className="map-order-list">{mappedOrders.slice(0, 8).map((order) => <div className="map-order-row" key={order.id}><span className={`status-dot ${order.status}`} /><strong>#{order.order_number}</strong><span>{order.customer?.name || 'Customer'}</span><small>{order.tracking_company || order.tracking_number || 'Carrier update'}</small><span>{order.delivery_updated_at ? formatDate(order.delivery_updated_at) : 'Position received'}</span></div>)}</div>}
        </section>
      ) : visibleOrders.length ? (
        <section className="panel table-panel order-table-panel">
          <table className="data-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Delivery</th><th>Total</th><th>Date</th><th /></tr></thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>#{order.order_number}</strong></td>
                  <td>{order.customer?.name || `Customer #${order.customer_id}`}</td>
                  <td>
                    {canStatus ? (
                      <select value={order.status} onChange={(e) => changeStatus(order, e.target.value)}>
                        {[order.status, ...(order.allowed_next_statuses || [])].filter((value, index, all) => all.indexOf(value) === index).map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                      </select>
                    ) : <span className={`status-pill ${order.status}`}>{order.status}</span>}
                  </td>
                  <td className="delivery-cell">
                    {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noreferrer">{order.tracking_company || 'Track shipment'}</a> : order.tracking_number || (order.status === 'shipped' ? 'Awaiting carrier' : '—')}
                    {order.tracking_number && <small>{order.tracking_number}</small>}
                  </td>
                  <td>{money(order.total_amount)}</td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>{canInvoice && !order.invoice && <button className="text-btn" onClick={() => invoice(order)}>Invoice</button>}</td>
                </tr>
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
