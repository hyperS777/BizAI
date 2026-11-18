import { useEffect, useMemo, useState } from 'react';
import {
  MapPin, MapPinned, ClipboardList, List, ChevronDown, ChevronRight,
  Package, FileText, ExternalLink, Truck, Printer, XCircle, Edit3, Trash2, Tag, Plus, Check,
} from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import client, { downloadPackingSlipPdf } from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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
function OrderRow({ order, canStatus, canInvoice, onChangeStatus, onInvoice, onEditShipping, onCancelOrder }) {
  const [expanded, setExpanded] = useState(false);

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
          {canInvoice && !order.invoice && order.status !== 'cancelled' && (
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
                <div className="order-detail-heading"><Package size={14} /> Items Ordered</div>
                <div className="order-detail-items">
                  {order.items?.length ? order.items.map((item, i) => (
                    <div className="order-detail-item" key={i}>
                      {item.product?.image_url && (
                        <img src={item.product.image_url} alt="" className="order-item-thumb" />
                      )}
                      <div>
                        <strong>{item.product?.name || `Product #${item.product_id}`}</strong>
                        {item.variant && <small>{item.variant.option1}{item.variant.option2 ? ` / ${item.variant.option2}` : ''} (SKU: {item.sku || item.variant.sku})</small>}
                        <span>Qty: {item.quantity} · {money(item.unit_price || item.product?.price || 0)} each</span>
                      </div>
                      <b>{money((item.unit_price || item.product?.price || 0) * item.quantity)}</b>
                    </div>
                  )) : <span className="muted">No item details available</span>}
                </div>
              </div>

              {/* Delivery info */}
              <div className="order-detail-section">
                <div className="order-detail-heading"><Truck size={14} /> Delivery &amp; Logistics</div>
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
                <div className="order-detail-heading"><FileText size={14} /> Order Financials</div>
                <div className="order-detail-meta">
                  {order.notes && <span><strong>Notes:</strong> {order.notes}</span>}
                  {order.discount_code && <span><strong>Discount code:</strong> <code>{order.discount_code}</code></span>}
                  {order.discount_amount > 0 && <span><strong>Discount applied:</strong> −{money(order.discount_amount)}</span>}
                  {order.shipping_amount > 0 && <span><strong>Shipping:</strong> +{money(order.shipping_amount)}</span>}
                  <span><strong>Subtotal:</strong> {money(order.subtotal_amount || order.total_amount)}</span>
                  <span><strong>Total:</strong> {money(order.total_amount)}</span>
                  {order.invoice && (
                    <span>
                      <strong>Invoice:</strong> #{order.invoice.invoice_number}
                      {' '}
                      <span className={`status-pill ${order.invoice.status}`}>{order.invoice.status}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Operational Action Bar */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => downloadPackingSlipPdf(order.id, `packing-slip-${order.order_number}.pdf`)}
                  title="Download and print official Delhivery shipping label & warehouse slip"
                >
                  <Printer size={13} /> Print Delhivery Packing Slip
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => onEditShipping(order)}
                >
                  <Edit3 size={13} /> Edit Address &amp; Tracking
                </button>
                {order.status !== 'cancelled' && order.status !== 'delivered' && canStatus && (
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    onClick={() => onCancelOrder(order)}
                  >
                    <XCircle size={13} /> Cancel Order &amp; Restore Stock
                  </button>
                )}
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
  const toast = useToast();
  const canCreate = can(['admin', 'manager', 'employee']);
  const canStatus = can(['admin', 'manager']);
  const canInvoice = can(['admin', 'manager', 'accountant']);
  const canSeeSimulations = can(['admin', 'manager']);
  const [orders, setOrders] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('orders');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(false);
  const [editShippingOrder, setEditShippingOrder] = useState(null);
  const [shippingForm, setShippingForm] = useState({ shipping_address: '', tracking_company: '', tracking_number: '', notes: '' });

  // Rich Order Creation State
  const [form, setForm] = useState({
    customer_id: '',
    shipping_address: '',
    discount_code: '',
    shipping_amount: 0,
    notes: '',
    items: [{ product_id: '', variant_id: '', quantity: 1, unit_price: 0 }],
  });
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [selectedMapOrder, setSelectedMapOrder] = useState(null);

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
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const statusCounts = useMemo(() => orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    counts.all += 1;
    return counts;
  }, { all: 0, simulations: simulations.length }), [orders, simulations.length]);

  const tabs = canSeeSimulations ? [...statusTabs, { id: 'simulations', label: 'Simulations' }] : statusTabs;
  const visibleOrders = useMemo(() => {
    let list = status === 'all' ? orders : orders.filter((order) => order.status === status);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((order) =>
        String(order.order_number).toLowerCase().includes(q)
        || String(order.customer?.name || '').toLowerCase().includes(q)
        || String(order.customer?.email || '').toLowerCase().includes(q)
        || (order.items || []).some((item) => String(item.product?.name || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, status, search]);

  const mappedOrders = useMemo(() => visibleOrders.filter((order) => (
    order.status !== 'cancelled'
    && Number.isFinite(order.delivery_latitude)
    && Number.isFinite(order.delivery_longitude)
  )), [visibleOrders]);

  // Handle Customer Selection in New Order
  const handleCustomerSelect = (customerId) => {
    const cust = customers.find((c) => String(c.id) === String(customerId));
    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      shipping_address: cust?.address || '',
    }));
  };

  const handleProductSelect = (index, productId) => {
    const p = products.find((prod) => String(prod.id) === String(productId));
    const defaultVariant = p?.variants?.[0];
    const items = [...form.items];
    items[index] = {
      ...items[index],
      product_id: productId,
      variant_id: defaultVariant?.id || '',
      unit_price: defaultVariant ? defaultVariant.selling_price : (p?.price || 0),
    };
    setForm({ ...form, items });
  };

  const handleVariantSelect = (index, variantId) => {
    const item = form.items[index];
    const p = products.find((prod) => String(prod.id) === String(item.product_id));
    const variant = p?.variants?.find((v) => String(v.id) === String(variantId));
    const items = [...form.items];
    items[index] = {
      ...items[index],
      variant_id: variantId,
      unit_price: variant ? variant.selling_price : (p?.price || 0),
    };
    setForm({ ...form, items });
  };

  const addLine = () => setForm({
    ...form,
    items: [...form.items, { product_id: '', variant_id: '', quantity: 1, unit_price: 0 }],
  });

  const removeLine = (index) => {
    if (form.items.length <= 1) return;
    setForm({
      ...form,
      items: form.items.filter((_, i) => i !== index),
    });
  };

  // Subtotal, Discount, Shipping, Grand Total Calculation
  const subtotal = useMemo(() => {
    return form.items.reduce((sum, item) => {
      return sum + (Number(item.unit_price || 0) * Number(item.quantity || 1));
    }, 0);
  }, [form.items]);

  const discountAmount = useMemo(() => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === 'percent') {
      return Math.round((subtotal * (appliedDiscount.value / 100)) * 100) / 100;
    }
    return Math.min(appliedDiscount.value, subtotal);
  }, [appliedDiscount, subtotal]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountAmount) + Number(form.shipping_amount || 0);
  }, [subtotal, discountAmount, form.shipping_amount]);

  const applyDiscountCode = () => {
    const code = (form.discount_code || '').trim().toUpperCase();
    if (!code) return;
    if (code === 'REIHH10' || code === 'FIRST10') {
      setAppliedDiscount({ code, type: 'percent', value: 10 });
    } else if (code === 'VIP15') {
      setAppliedDiscount({ code, type: 'percent', value: 15 });
    } else if (code === 'STUDIO20') {
      setAppliedDiscount({ code, type: 'percent', value: 20 });
    } else if (code === 'FLAT500') {
      setAppliedDiscount({ code, type: 'fixed', value: 500 });
    } else {
      setAppliedDiscount({ code, type: 'percent', value: 10 });
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      await client.post('/orders', {
        customer_id: Number(form.customer_id),
        shipping_address: form.shipping_address || null,
        discount_code: appliedDiscount?.code || form.discount_code || null,
        shipping_amount: Number(form.shipping_amount || 0),
        notes: form.notes || null,
        items: form.items
          .filter((item) => item.product_id)
          .map((item) => ({
            product_id: Number(item.product_id),
            variant_id: item.variant_id ? Number(item.variant_id) : null,
            quantity: Number(item.quantity || 1),
          })),
      });
      setModal(false);
      setNotice('New order created successfully.');
      toast?.success('Order created successfully');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create order'));
      toast?.error(apiError(err, 'Could not create order'));
    }
  };

  const changeStatus = async (order, next) => {
    try {
      await client.patch(`/orders/${order.id}/status`, { status: next });
      toast?.success(`Order #${order.order_number} marked as ${next}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update status'));
      toast?.error('Could not update status');
    }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`Are you sure you want to cancel order #${order.order_number}? Inventory stock will be automatically restored.`)) return;
    try {
      await client.patch(`/orders/${order.id}/status`, { status: 'cancelled' });
      setNotice(`Order #${order.order_number} cancelled and stock reversed.`);
      toast?.info(`Order #${order.order_number} cancelled; stock restored.`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not cancel order'));
      toast?.error('Could not cancel order');
    }
  };

  const openEditShipping = (order) => {
    setEditShippingOrder(order);
    setShippingForm({
      shipping_address: order.shipping_address || '',
      tracking_company: order.tracking_company || 'Delhivery',
      tracking_number: order.tracking_number || '',
      notes: order.notes || '',
    });
  };

  const saveShippingUpdate = async (e) => {
    e.preventDefault();
    try {
      await client.put(`/orders/${editShippingOrder.id}`, shippingForm);
      setEditShippingOrder(null);
      setNotice('Order shipping details updated.');
      toast?.success('Delhivery tracking & shipping updated');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update order details'));
      toast?.error('Could not update shipping details');
    }
  };

  const invoice = async (order) => {
    try {
      await client.post('/invoices', { order_id: order.id });
      toast?.success(`GST Tax Invoice generated for #${order.order_number}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create invoice'));
      toast?.error('Could not create invoice');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Create orders, variant sizing, Delhivery packing slips, and automated invoicing.">
        {canCreate && (
          <button
            className="primary-btn heading-btn"
            onClick={() => {
              setForm({
                customer_id: '',
                shipping_address: '',
                discount_code: '',
                shipping_amount: 0,
                notes: '',
                items: [{ product_id: '', variant_id: '', quantity: 1, unit_price: 0 }],
              });
              setAppliedDiscount(null);
              setModal(true);
            }}
          >
            <Plus size={14} /> New order
          </button>
        )}
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="orders-toolbar">
        <div className="order-status-tabs" role="tablist" aria-label="Filter orders by status">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              className={status === tab.id ? 'order-tab active' : 'order-tab'}
              onClick={() => { setStatus(tab.id); if (tab.id === 'simulations') setView('orders'); }}
            >
              {tab.label}<span>{tab.id === 'simulations' ? simulations.length : statusCounts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="order-view-toggle" role="group" aria-label="Order view">
          <button type="button" className={view === 'orders' ? 'active' : ''} aria-label="Orders list" title="Orders list" onClick={() => setView('orders')}><List size={17} /></button>
          <button type="button" disabled={status === 'simulations'} className={view === 'map' ? 'active' : ''} aria-label="Delivery map" title="Delivery map" onClick={() => setView('map')}><MapPinned size={17} /></button>
        </div>
      </div>

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
                <td>{sim.items}</td>
                <td>{money(sim.total_amount)}</td>
                <td>{formatDate(sim.created_at)}</td>
                <td><span className="status-pill shipped">{sim.delivery_status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : <EmptyState icon={Package} text="No simulated storefront checkouts." /> : view === 'map' ? (
        <section className="panel delivery-map-panel" style={{ height: 520, position: 'relative' }}>
          <div style={{ padding: '10px 14px', background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Truck size={14} style={{ color: 'var(--teal)' }} /> REIHH Fulfillment Logistics Map
              </span>
              <span style={{ color: 'var(--muted)' }}>{mappedOrders.length} active shipments plotted</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Delivered</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} /> In Transit</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Confirmed</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> Pending</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0e766e', border: '2px solid #fff', display: 'inline-block' }} /> Okhla DC</span>
            </div>
            {selectedMapOrder && (
              <button
                type="button"
                className="text-btn"
                onClick={() => setSelectedMapOrder(null)}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                Clear Selected Route
              </button>
            )}
          </div>

          <div style={{ position: 'relative', height: 'calc(100% - 42px)', width: '100%' }}>
            <MapContainer center={[28.5355, 77.2713]} zoom={6} style={{ height: '100%', width: '100%', borderRadius: '0 0 8px 8px' }} zoomControl={false}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="bottomright" />
              <MapBounds orders={mappedOrders} />

              {/* REIHH Central DC Warehouse Marker */}
              <CircleMarker
                center={[28.5355, 77.2713]}
                radius={10}
                pathOptions={{ color: '#0e766e', fillColor: '#0e766e', fillOpacity: 0.9, weight: 3 }}
              >
                <Popup>
                  <div style={{ padding: 2 }}>
                    <strong style={{ display: 'block', fontSize: 13, color: '#0e766e' }}>🏭 REIHH Central Fulfillment DC</strong>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Okhla Phase III, New Delhi 110020</div>
                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>Integrated with Delhivery Express Hub</div>
                  </div>
                </Popup>
              </CircleMarker>

              {/* Delivery Orders Pins */}
              {mappedOrders.map((o) => {
                const isSelected = selectedMapOrder?.id === o.id;
                return (
                  <CircleMarker
                    key={o.id}
                    center={[o.delivery_latitude, o.delivery_longitude]}
                    radius={isSelected ? 11 : 8}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : (STATUS_COLORS[o.status] || '#14b8a6'),
                      fillColor: STATUS_COLORS[o.status] || '#14b8a6',
                      fillOpacity: 0.9,
                      weight: isSelected ? 3 : 2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedMapOrder(o),
                    }}
                  >
                    <Popup>
                      <div style={{ padding: 2, minWidth: 180 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <strong style={{ fontSize: 13 }}>#{o.order_number}</strong>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: STATUS_COLORS[o.status] || '#64748b', color: '#fff', textTransform: 'uppercase', fontWeight: 700 }}>
                            {o.status}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{o.customer?.name || 'Customer'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{o.delivery_location || o.shipping_address || 'Delhi NCR'}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{money(o.total_amount)}</div>
                        {o.tracking_number && (
                          <div style={{ marginTop: 4, fontSize: 11 }}>
                            <strong>AWB:</strong> {o.tracking_number} ({o.tracking_company || 'Delhivery'})
                          </div>
                        )}
                        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="outline-btn"
                            style={{ fontSize: 10, padding: '3px 8px' }}
                            onClick={() => downloadPackingSlipPdf(o.id, o.order_number)}
                          >
                            Packing Slip
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* Connecting Dispatch Route from Okhla DC to Selected Order */}
              {selectedMapOrder && Number.isFinite(selectedMapOrder.delivery_latitude) && (
                <Polyline
                  positions={[
                    [28.5355, 77.2713],
                    [selectedMapOrder.delivery_latitude, selectedMapOrder.delivery_longitude],
                  ]}
                  pathOptions={{ color: '#0e766e', weight: 3, dashArray: '6, 8', opacity: 0.8 }}
                />
              )}
            </MapContainer>

            {/* Selected Order Floating Card */}
            {selectedMapOrder && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  zIndex: 1000,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 14,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  maxWidth: 290,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>#{selectedMapOrder.order_number}</strong>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: STATUS_COLORS[selectedMapOrder.status] || '#64748b', color: '#fff', textTransform: 'uppercase', fontWeight: 700 }}>
                    {selectedMapOrder.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedMapOrder.customer?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{selectedMapOrder.shipping_address || selectedMapOrder.delivery_location}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal)', marginTop: 6 }}>{money(selectedMapOrder.total_amount)}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--muted)' }}>
                  Carrier: <strong>{selectedMapOrder.tracking_company || 'Delhivery Express'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className="primary-btn"
                    style={{ fontSize: 11, padding: '4px 10px', flex: 1 }}
                    onClick={() => downloadPackingSlipPdf(selectedMapOrder.id, selectedMapOrder.order_number)}
                  >
                    <Printer size={12} /> Packing Slip
                  </button>
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ fontSize: 11, padding: '4px 8px' }}
                    onClick={() => setSelectedMapOrder(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : visibleOrders.length ? (
        <section className="panel table-panel order-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Order</th>
                <th style={{ width: '22%' }}>Customer</th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '22%' }}>Carrier &amp; AWB</th>
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
                  onEditShipping={openEditShipping}
                  onCancelOrder={cancelOrder}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={ClipboardList} text={status === 'all' ? 'No orders recorded yet.' : `No ${status.replace('_', ' ')} orders.`} />}

      {/* Rich Order Creation Modal */}
      {modal && (
        <Modal title="Create New Sales Order" onClose={() => setModal(false)}>
          <form className="stack-form" onSubmit={save} style={{ maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>
            <label>Customer*
              <select value={form.customer_id} onChange={(e) => handleCustomerSelect(e.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company ? `(${c.company})` : ''} · {c.phone || c.email || ''}
                  </option>
                ))}
              </select>
            </label>

            <label>Shipping Address*
              <textarea
                rows={2}
                value={form.shipping_address}
                onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
                placeholder="Street address, city, state, postal code"
                required
              />
            </label>

            {/* Line Items with Variant Selector */}
            <div style={{ background: 'var(--panel-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Line Items &amp; Garments</strong>
                <button type="button" className="text-btn" onClick={addLine}>+ Add Product Line</button>
              </div>

              {form.items.map((item, index) => {
                const selectedProd = products.find((p) => String(p.id) === String(item.product_id));
                const variants = selectedProd?.variants || [];
                return (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 70px 100px 24px', gap: 6, alignItems: 'center', marginBottom: 8, background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                    <select
                      value={item.product_id}
                      onChange={(e) => handleProductSelect(index, e.target.value)}
                      required
                      style={{ fontSize: 12 }}
                    >
                      <option value="">Select Garment</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({money(p.price)})</option>
                      ))}
                    </select>

                    {/* Variant dropdown */}
                    {variants.length > 0 ? (
                      <select
                        value={item.variant_id}
                        onChange={(e) => handleVariantSelect(index, e.target.value)}
                        style={{ fontSize: 12 }}
                      >
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.option1 || ''} {v.option2 ? `/ ${v.option2}` : ''} (Stock: {v.stock_qty})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 4 }}>Standard</span>
                    )}

                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[index] = { ...item, quantity: Number(e.target.value) || 1 };
                        setForm({ ...form, items });
                      }}
                      style={{ fontSize: 12, padding: '4px 6px' }}
                      title="Quantity"
                    />

                    <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                      {money((item.unit_price || 0) * (item.quantity || 1))}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={form.items.length <= 1}
                      style={{ border: 'none', background: 'transparent', color: form.items.length <= 1 ? '#ccc' : '#ef4444', cursor: form.items.length <= 1 ? 'default' : 'pointer' }}
                      title="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Discount Code & Shipping */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12 }}>Discount Coupon (e.g. REIHH10, VIP15)
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      value={form.discount_code}
                      onChange={(e) => setForm({ ...form, discount_code: e.target.value.toUpperCase() })}
                      placeholder="Coupon code"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <button type="button" className="outline-btn" onClick={applyDiscountCode}>Apply</button>
                  </div>
                </label>
                {appliedDiscount && (
                  <small style={{ color: '#10b981', display: 'block', marginTop: 4 }}>
                    <Check size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {appliedDiscount.code} applied ({appliedDiscount.type === 'percent' ? `${appliedDiscount.value}% off` : `₹${appliedDiscount.value} off`})
                  </small>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12 }}>Shipping Fee (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.shipping_amount}
                    onChange={(e) => setForm({ ...form, shipping_amount: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>
            </div>

            {/* Pricing Summary */}
            <div style={{ background: 'var(--panel-alt)', padding: 12, borderRadius: 6, fontSize: 13, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Subtotal:</span>
                <span>{money(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#10b981' }}>
                  <span>Discount:</span>
                  <span>−{money(discountAmount)}</span>
                </div>
              )}
              {form.shipping_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Shipping:</span>
                  <span>+{money(form.shipping_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                <span>Total Due:</span>
                <span style={{ color: 'var(--teal)' }}>{money(grandTotal)}</span>
              </div>
            </div>

            <label>Order Notes / Delivery Instructions
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Leave package with guard" />
            </label>

            <button className="primary-btn" type="submit" disabled={!form.customer_id || subtotal <= 0}>
              Create Order ({money(grandTotal)})
            </button>
          </form>
        </Modal>
      )}

      {/* Edit Shipping & Tracking Modal */}
      {editShippingOrder && (
        <Modal title={`Edit Shipping · Order #${editShippingOrder.order_number}`} onClose={() => setEditShippingOrder(null)}>
          <form className="stack-form" onSubmit={saveShippingUpdate}>
            <label>Shipping Address
              <textarea
                rows={3}
                value={shippingForm.shipping_address}
                onChange={(e) => setShippingForm({ ...shippingForm, shipping_address: e.target.value })}
                required
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Logistics Carrier
                <input
                  value={shippingForm.tracking_company}
                  onChange={(e) => setShippingForm({ ...shippingForm, tracking_company: e.target.value })}
                  placeholder="e.g. Delhivery, Bluedart"
                />
              </label>
              <label>Courier AWB / Tracking #
                <input
                  value={shippingForm.tracking_number}
                  onChange={(e) => setShippingForm({ ...shippingForm, tracking_number: e.target.value })}
                  placeholder="e.g. 129847192847"
                />
              </label>
            </div>
            <label>Order Notes
              <input
                value={shippingForm.notes}
                onChange={(e) => setShippingForm({ ...shippingForm, notes: e.target.value })}
              />
            </label>
            <button className="primary-btn" type="submit">Update Shipping Details</button>
          </form>
        </Modal>
      )}
    </>
  );
}
