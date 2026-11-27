import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapPin, MapPinned, ClipboardList, List, ChevronDown, ChevronRight,
  Package, FileText, ExternalLink, Truck, Printer, XCircle, Edit3, Trash2, Tag, Plus, Check,
  Clock3, Download, MessageCircle, RotateCcw, Barcode, ShoppingCart,
} from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import client, { downloadPackingSlipPdf } from '../api/client';
import { ChannelBadge, ChannelFilter, EmptyState, Modal, PageHeader, ConfirmDialog } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { emitWorkspaceSync, subscribeWorkspaceSync } from '../utils/sync';

const statusTabs = [
  { id: 'all', label: 'All orders' },
  { id: 'draft_real', label: 'Real Drafts' },
  { id: 'draft_demo', label: 'Demo Drafts' },
  { id: 'abandoned', label: 'Abandoned' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'shipped', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'returned', label: 'Returned' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS = {
  draft: '#64748b',
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
  returned: '#a855f7',
  cancelled: '#ef4444',
};

const orderStatusLabel = (status) => ({
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'In transit',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
}[status] || String(status || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));

const deliveryStageLabel = (status) => ({
  ready_to_pack: 'Ready to pack',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed_delivery: 'Failed attempt',
  returned_to_store: 'Returned',
}[status] || String(status || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));

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
function OrderRow({ order, canStatus, canInvoice, onChangeStatus, onInvoice, onEditShipping, onCancelOrder, onReturnOrder, onDelhiveryScan, isSelected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const isAllocated = ['confirmed', 'shipped', 'delivered', 'returned'].includes(order.status);
  const isDispatched = ['shipped', 'delivered', 'returned'].includes(order.status);

  return (
    <>
      <tr
        className={`order-data-row ${expanded ? 'expanded' : ''} ${isSelected ? 'selected-row' : ''}`}
        onClick={() => setExpanded((x) => !x)}
      >
        <td onClick={(e) => e.stopPropagation()} style={{ width: 34, textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={(e) => onToggleSelect(order.id, e.target.checked)}
            aria-label={`Select order ${order.order_number}`}
          />
        </td>
        <td>
          <span className="order-expand-icon">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <strong>#{order.order_number}</strong>{' '}
          <ChannelBadge channel={order.channel} compact />
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
                <option key={v} value={v}>{orderStatusLabel(v)}</option>
              ))}
            </select>
          ) : (
            <span className={`status-pill ${order.status}`}>{orderStatusLabel(order.status)}</span>
          )}
        </td>
        <td className="delivery-cell">
          {order.tracking_url
            ? <a href={order.tracking_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{order.tracking_company || 'Track'} <ExternalLink size={11} /></a>
            : order.tracking_number || (order.status === 'shipped' ? 'Awaiting carrier' : '—')}
          {order.delivery_location && <small>{order.delivery_location}</small>}
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>{money(order.total_amount)}</strong>
            <ChannelBadge channel={order.channel} compact />
          </div>
        </td>
        <td>{formatDate(order.created_at)}</td>
        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {canStatus && order.status === 'draft' && (
            <button className="text-btn" onClick={() => onChangeStatus(order, 'pending')}>Open Order</button>
          )}
          {canInvoice && !order.invoice && !['draft', 'cancelled'].includes(order.status) && (
            <button className="text-btn" onClick={() => onInvoice(order)}>Invoice</button>
          )}
          {order.invoice && <span className="status-pill delivered" style={{ fontSize: 11 }}>Invoiced</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="order-detail-row">
          <td colSpan={8}>
            <div className="order-detail-panel">
              {/* Shopify-Style Lifecycle Timeline */}
              <div className="order-detail-section" style={{ gridColumn: '1 / -1' }}>
                <div className="order-detail-heading"><Clock3 size={14} /> Order Activity &amp; Fulfillment Timeline</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 8 }}>
                  <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} /> {order.status === 'draft' ? '1. Draft Saved' : '1. Placed'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{formatDate(order.created_at)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{order.customer?.name || 'Customer'}</div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isAllocated ? 'var(--teal)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isAllocated ? <Check size={12} /> : '○'} 2. Allocated
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                      {order.status === 'draft' ? 'Draft (No Stock Held)' : isAllocated ? 'Stock Reserved' : 'Pending Allocation'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Okhla Phase III DC</div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isDispatched ? 'var(--teal)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isDispatched ? <Check size={12} /> : '○'} 3. Dispatched
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{order.tracking_company || 'Delhivery Express'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>AWB: {order.tracking_number || 'Awaiting dispatch'}</div>
                  </div>

                  <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--panel-alt)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: order.status === 'delivered' ? 'var(--teal)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {order.status === 'delivered' ? <Check size={12} /> : '○'} 4. Delivered
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                      {order.status === 'delivered' ? 'Delivered to Customer' : order.status === 'returned' ? 'Returned' : order.status === 'cancelled' ? 'Cancelled' : 'In Fulfillment'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{order.delivery_location || 'Destination'}</div>
                  </div>
                </div>
              </div>

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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <strong>Total:</strong> {money(order.total_amount)} <ChannelBadge channel={order.channel} compact />
                  </span>
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
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {order.customer?.phone && (
                  <a
                    className="outline-btn"
                    href={`https://wa.me/${order.customer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `🛍️ *REIHH Studio Order Update*\n\nDear ${order.customer.name},\nYour order *#${order.order_number}* is currently: *${order.status.toUpperCase()}*.\n\n📍 *Location:* ${order.delivery_location || 'Delhi NCR'}\n🚚 *Carrier:* ${order.tracking_company || 'Express Logistics'}\n🔗 *Track:* ${order.tracking_url || 'https://www.reihh.com'}\n\nThank you for choosing REIHH Studio! 🙏`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    title="Send instant WhatsApp delivery update to customer"
                  >
                    <MessageCircle size={13} style={{ color: '#25D366' }} /> WhatsApp Concierge
                  </a>
                )}
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => downloadPackingSlipPdf(order.id, `packing-slip-${order.order_number}.pdf`)}
                  title="Download and print official shipping label & warehouse slip"
                >
                  <Printer size={13} /> Print Packing Slip
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => onEditShipping(order)}
                >
                  <Edit3 size={13} /> Edit Address &amp; Tracking
                </button>
                {canStatus && !['cancelled', 'returned'].includes(order.status) && (
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => onDelhiveryScan(order)}
                    title="Send a Delhivery carrier scan event to update order status"
                  >
                    <Truck size={13} /> Delhivery Scan
                  </button>
                )}
                {order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'returned' && canStatus && (
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    onClick={() => onCancelOrder(order)}
                  >
                    <XCircle size={13} /> Cancel Order &amp; Restore Stock
                  </button>
                )}
                {(order.status === 'delivered' || order.status === 'shipped') && canStatus && (
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ color: '#8b5cf6', borderColor: '#d8b4fe' }}
                    onClick={() => onReturnOrder(order)}
                    title="Restock garments to warehouse and credit/void invoice"
                  >
                    <RotateCcw size={13} /> Process Return &amp; Restock
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
  const [searchParams] = useSearchParams();
  const canCreate = can(['admin', 'manager', 'employee']);
  const canStatus = can(['admin', 'manager']);
  const canInvoice = can(['admin', 'manager', 'accountant']);
  const canSeeSimulations = can(['admin', 'manager']);
  const [orders, setOrders] = useState([]);
  const [abandoned, setAbandoned] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState(() => {
    const t = searchParams.get('tab') || 'all';
    return t === 'draft' ? 'draft_real' : t;
  });
  const [channelFilter, setChannelFilter] = useState('all'); // all | real | demo
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [view, setView] = useState('orders');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(() => searchParams.get('action') === 'new');
  const [editShippingOrder, setEditShippingOrder] = useState(null);
  const [shippingForm, setShippingForm] = useState({ shipping_address: '', tracking_company: '', tracking_number: '', notes: '' });
  const [delhiveryOrder, setDelhiveryOrder] = useState(null);
  const [delhiveryForm, setDelhiveryForm] = useState({ status: 'In Transit', location: 'Gurugram Hub, Haryana', note: '' });
  const [delhiveryBusy, setDelhiveryBusy] = useState(false);

  // Rich Order Creation State
  const [form, setForm] = useState({
    customer_id: '',
    shipping_address: '',
    discount_code: '',
    shipping_amount: 0,
    channel: 'real',
    notes: '',
    items: [{ product_id: '', variant_id: '', quantity: 1, unit_price: 0 }],
  });
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [selectedMapOrder, setSelectedMapOrder] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [returnModalOrder, setReturnModalOrder] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [discountValidationMsg, setDiscountValidationMsg] = useState('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) setStatus(tabParam === 'draft' ? 'draft_real' : tabParam);
    const qParam = searchParams.get('q');
    if (qParam !== null) setSearch(qParam);
    if (searchParams.get('action') === 'new') setModal(true);
  }, [searchParams]);

  const load = () => {
    client.get('/orders', { params: { limit: 250 } })
      .then((res) => setOrders(res.data || []))
      .catch((err) => setError(apiError(err)));
    client.get('/storefront/abandoned-checkouts', { params: { limit: 150 } })
      .then((res) => setAbandoned(res.data || []))
      .catch(() => {});
    if (canSeeSimulations) {
      client.get('/storefront/simulations')
        .then((res) => setSimulations(res.data || []))
        .catch(() => {});
    }
  };

  useEffect(() => {
    client.get('/customers').then((res) => setCustomers(res.data || []));
    client.get('/products').then((res) => setProducts(res.data || []));
  }, []);

  useEffect(() => { load(); }, [canSeeSimulations]);
  useEffect(() => {
    const timer = window.setInterval(load, 15_000);
    const unsub = subscribeWorkspaceSync(load);
    return () => {
      window.clearInterval(timer);
      unsub();
    };
  }, [canSeeSimulations]);

  const openAbandonedCount = useMemo(
    () => abandoned.filter((c) => c.recovery_status === 'abandoned').length,
    [abandoned],
  );

  const statusCounts = useMemo(() => orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    if (order.status === 'draft') {
      if (order.channel === 'demo') counts.draft_demo += 1;
      else counts.draft_real += 1;
    }
    counts.all += 1;
    return counts;
  }, { all: 0, draft_real: 0, draft_demo: 0, abandoned: openAbandonedCount, simulations: simulations.length }), [orders, openAbandonedCount, simulations.length]);

  const channelCounts = useMemo(() => {
    const real = orders.filter((o) => o.channel !== 'demo').length;
    const demo = orders.filter((o) => o.channel === 'demo').length;
    return { all: orders.length, real, demo };
  }, [orders]);

  const orderTotalsByChannel = useMemo(() => {
    let actualTotal = 0;
    let demoTotal = 0;
    let actualCount = 0;
    let demoCount = 0;
    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'draft') continue;
      if (o.channel === 'demo') {
        demoTotal += Number(o.total_amount || 0);
        demoCount += 1;
      } else {
        actualTotal += Number(o.total_amount || 0);
        actualCount += 1;
      }
    }
    return { actualTotal, demoTotal, actualCount, demoCount };
  }, [orders]);

  const tabs = canSeeSimulations ? [...statusTabs, { id: 'simulations', label: 'Demo runs' }] : statusTabs;
  const visibleOrders = useMemo(() => {
    let list = orders;
    if (channelFilter !== 'all') {
      list = list.filter((order) => (order.channel === 'demo' ? 'demo' : 'real') === channelFilter);
    }
    if (status === 'draft_real') {
      list = list.filter((order) => order.status === 'draft' && order.channel !== 'demo');
    } else if (status === 'draft_demo') {
      list = list.filter((order) => order.status === 'draft' && order.channel === 'demo');
    } else if (status !== 'all') {
      list = list.filter((order) => order.status === status);
    }
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
  }, [orders, status, search, channelFilter]);

  const mappedOrders = useMemo(() => visibleOrders.filter((order) => (
    order.status !== 'cancelled'
    && Number.isFinite(order.delivery_latitude)
    && Number.isFinite(order.delivery_longitude)
  )), [visibleOrders]);

  const toggleSelectOrder = (id, checked) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedOrderIds(new Set(visibleOrders.map((o) => o.id)));
    } else {
      setSelectedOrderIds(new Set());
    }
  };

  const allVisibleSelected = visibleOrders.length > 0 && visibleOrders.every((o) => selectedOrderIds.has(o.id));

  const handleBatchStatus = async (nextStatus) => {
    const ids = Array.from(selectedOrderIds);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => client.patch(`/orders/${id}/status`, { status: nextStatus })));
      toast.success(`Updated ${ids.length} orders to ${orderStatusLabel(nextStatus)}`);
      setSelectedOrderIds(new Set());
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update some orders'));
    }
  };

  const handleExportCsv = () => {
    const list = selectedOrderIds.size > 0
      ? visibleOrders.filter((o) => selectedOrderIds.has(o.id))
      : visibleOrders;
    if (!list.length) return;

    const headers = ['Order Number', 'Customer Name', 'Customer Email', 'Status', 'Carrier', 'Tracking Number', 'Total Amount', 'Date', 'Shipping Address'];
    const rows = list.map((o) => [
      `"${o.order_number}"`,
      `"${o.customer?.name || ''}"`,
      `"${o.customer?.email || ''}"`,
      `"${o.status}"`,
      `"${o.tracking_company || 'Express Logistics'}"`,
      `"${o.tracking_number || ''}"`,
      o.total_amount,
      `"${formatDate(o.created_at)}"`,
      `"${(o.shipping_address || o.delivery_location || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reihh-orders-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${list.length} orders to CSV`);
  };

  const handleBatchPrintSlips = () => {
    const ids = Array.from(selectedOrderIds);
    if (!ids.length) return;
    ids.forEach((id, idx) => {
      const ord = orders.find((o) => o.id === id);
      setTimeout(() => {
        downloadPackingSlipPdf(id, `packing-slip-${ord?.order_number || id}.pdf`);
      }, idx * 400);
    });
    toast.info(`Triggered packing slip download for ${ids.length} orders`);
  };

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

  const applyDiscountCode = async () => {
    const code = (form.discount_code || '').trim().toUpperCase();
    if (!code) return;
    try {
      const res = await client.post('/integrations/discounts/validate', { code, subtotal });
      setAppliedDiscount({
        code: res.data.code,
        type: res.data.discount_type,
        value: res.data.value,
        amount: res.data.discount_amount,
      });
      setDiscountValidationMsg('');
      toast?.success(`Promotional code ${res.data.code} applied!`);
    } catch (err) {
      setAppliedDiscount(null);
      const msg = err.response?.data?.detail || 'Invalid or expired promotional code';
      setDiscountValidationMsg(msg);
      toast?.error(msg);
    }
  };

  const handleBarcodeScan = () => {
    const q = barcodeInput.trim().toLowerCase();
    if (!q) return;
    const found = products.find((p) =>
      p.sku?.toLowerCase() === q ||
      p.name?.toLowerCase().includes(q) ||
      (p.variants || []).some((v) => v.sku?.toLowerCase() === q || v.barcode === q)
    );
    if (!found) {
      toast?.error(`No garment or variant found for "${barcodeInput}"`);
      return;
    }
    const matchedVariant = (found.variants || []).find((v) => v.sku?.toLowerCase() === q || v.barcode === q) || found.variants?.[0];
    const unitPrice = matchedVariant ? matchedVariant.selling_price : found.price;
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items.filter((it) => it.product_id),
        {
          product_id: found.id,
          variant_id: matchedVariant?.id || '',
          quantity: 1,
          unit_price: unitPrice,
        },
      ],
    }));
    setBarcodeInput('');
    toast?.success(`Quick-added "${found.name}" (${matchedVariant ? matchedVariant.title : 'Standard'})`);
  };

  const returnOrder = (order) => {
    setReturnModalOrder(order);
  };

  const confirmReturnOrder = async () => {
    if (!returnModalOrder) return;
    const order = returnModalOrder;
    setReturnModalOrder(null);
    try {
      await client.patch(`/orders/${order.id}/status`, { status: 'returned' });
      setNotice(`Order #${order.order_number} processed as Returned. Inventory restocked.`);
      toast?.info(`Order #${order.order_number} returned; stock replenished.`);
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not process return'));
      toast?.error('Failed to process customer return');
    }
  };

  const save = async (event, orderStatus = 'pending', orderChannel = null) => {
    event.preventDefault();
    const resolvedChannel = orderChannel || form.channel || 'real';
    try {
      const { data: created } = await client.post('/orders', {
        status: orderStatus,
        channel: resolvedChannel,
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
      setOrders((prev) => [created, ...prev]);
      setModal(false);
      const label = orderStatus === 'draft'
        ? (orderChannel === 'demo' ? 'Demo draft order saved.' : 'Real draft order saved.')
        : 'New order created successfully.';
      setNotice(label);
      toast?.success(label);
      if (orderStatus === 'draft') setStatus(orderChannel === 'demo' ? 'draft_demo' : 'draft_real');
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create order'));
      toast?.error(apiError(err, 'Could not create order'));
    }
  };

  const changeStatus = async (order, next) => {
    try {
      const { data: updated } = await client.patch(`/orders/${order.id}/status`, { status: next });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      toast?.success(`Order #${order.order_number} marked as ${orderStatusLabel(next)}`);
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update status'));
      toast?.error('Could not update status');
    }
  };

  const cancelOrder = (order) => {
    setCancelModalOrder(order);
  };

  const confirmCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const order = cancelModalOrder;
    setCancelModalOrder(null);
    try {
      const { data: updated } = await client.patch(`/orders/${order.id}/status`, { status: 'cancelled' });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      setNotice(`Order #${order.order_number} cancelled and stock reversed.`);
      toast?.info(`Order #${order.order_number} cancelled; stock restored.`);
      emitWorkspaceSync('orders');
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
      tracking_company: order.tracking_company || 'Express Logistics',
      tracking_number: order.tracking_number || '',
      notes: order.notes || '',
    });
  };

  const saveShippingUpdate = async (e) => {
    e.preventDefault();
    try {
      const { data: updated } = await client.put(`/orders/${editShippingOrder.id}`, shippingForm);
      setOrders((prev) => prev.map((o) => (o.id === editShippingOrder.id ? updated : o)));
      setEditShippingOrder(null);
      setNotice('Order shipping details updated.');
      toast?.success('Carrier tracking & shipping updated');
      emitWorkspaceSync('orders');
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
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create invoice'));
      toast?.error('Could not create invoice');
    }
  };

  const recoverAbandonedCheckout = async (checkout, targetStatus = 'draft') => {
    try {
      const { data } = await client.post(`/storefront/abandoned-checkouts/${checkout.id}/convert`, { status: targetStatus });
      const msg = `Recovered ${checkout.checkout_token} as ${targetStatus === 'draft' ? 'Demo Draft' : 'Pending'} order #${data.order_number}.`;
      setNotice(msg);
      toast?.success(msg);
      setStatus(targetStatus === 'draft' ? 'draft_demo' : 'pending');
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      toast?.error(apiError(err, 'Could not recover abandoned checkout'));
    }
  };

  const dismissAbandonedCheckout = async (checkout) => {
    try {
      await client.delete(`/storefront/abandoned-checkouts/${checkout.id}`);
      setAbandoned((prev) => prev.filter((c) => c.id !== checkout.id));
      toast?.info(`Dismissed abandoned checkout ${checkout.checkout_token}`);
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      toast?.error(apiError(err, 'Could not dismiss checkout'));
    }
  };

  const openDelhiveryModal = (order) => {
    setDelhiveryOrder(order);
    const defaultStatus = order.status === 'confirmed' ? 'In Transit'
      : order.status === 'shipped' ? 'Out for Delivery'
        : order.status === 'delivered' ? 'Delivered'
          : 'Confirmed';
    setDelhiveryForm({
      status: defaultStatus,
      location: order.delivery_location || 'Delhi NCR Okhla Hub',
      note: `Delhivery scan for #${order.order_number}`,
    });
  };

  const submitDelhiveryScan = async (e) => {
    e.preventDefault();
    if (!delhiveryOrder) return;
    setDelhiveryBusy(true);
    try {
      const { data } = await client.post('/integrations/delhivery/simulate', {
        order_id: delhiveryOrder.id,
        status: delhiveryForm.status,
        location: delhiveryForm.location,
        note: delhiveryForm.note,
      });
      toast?.success(`Delhivery updated #${data.order_number} → ${orderStatusLabel(data.order_status)}`);
      setNotice(`Delhivery carrier scan applied: #${data.order_number} is now ${orderStatusLabel(data.order_status)} (${data.location}).`);
      setDelhiveryOrder(null);
      emitWorkspaceSync('orders');
      load();
    } catch (err) {
      toast?.error(apiError(err, 'Could not apply Delhivery scan'));
    } finally {
      setDelhiveryBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Create orders, manage drafts & abandoned checkouts, Delhivery tracking, and GST invoicing.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="outline-btn heading-btn"
            onClick={() => window.open('/store/demo', '_blank')}
            title="Place a demo customer order on the REIHH storefront"
          >
            <ShoppingCart size={14} /> Demo Store Order ↗
          </button>
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
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      {/* Actual vs Demo Order Payment Totals */}
      <section className="payment-summary-strip">
        <div className="payment-summary-card real" style={{ cursor: 'pointer' }} onClick={() => setChannelFilter('real')}>
          <div className="payment-summary-head">
            <span>Actual Orders Total</span>
            <ChannelBadge channel="real" />
          </div>
          <strong className="payment-summary-value">{money(orderTotalsByChannel.actualTotal)}</strong>
          <div className="payment-summary-meta">
            <span>{orderTotalsByChannel.actualCount} active real orders</span>
          </div>
        </div>
        <div className="payment-summary-card demo" style={{ cursor: 'pointer' }} onClick={() => setChannelFilter('demo')}>
          <div className="payment-summary-head">
            <span>Demo Orders Total (Storefront / Sandbox)</span>
            <ChannelBadge channel="demo" />
          </div>
          <strong className="payment-summary-value">{money(orderTotalsByChannel.demoTotal)}</strong>
          <div className="payment-summary-meta">
            <span>{orderTotalsByChannel.demoCount} demo orders</span>
          </div>
        </div>
      </section>

      <div style={{ marginBottom: 10 }}>
        <ChannelFilter value={channelFilter} onChange={setChannelFilter} counts={channelCounts} />
      </div>

      <div className="orders-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div className="order-status-tabs" role="tablist" aria-label="Filter orders by status">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              className={status === tab.id ? 'order-tab active' : 'order-tab'}
              onClick={() => { setStatus(tab.id); if (tab.id === 'simulations' || tab.id === 'abandoned') setView('orders'); }}
            >
              {tab.label}<span>{tab.id === 'simulations' ? simulations.length : statusCounts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <input
            className="filter-input"
            placeholder="Search order #, customer, item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220, padding: '7px 12px', fontSize: 12, borderRadius: 6 }}
          />
          <div className="order-view-toggle" role="group" aria-label="Order view">
            <button type="button" className={view === 'orders' ? 'active' : ''} aria-label="Orders list" title="Orders list" onClick={() => setView('orders')}><List size={17} /></button>
            <button type="button" disabled={status === 'simulations' || status === 'abandoned'} className={view === 'map' ? 'active' : ''} aria-label="Delivery map" title="Delivery map" onClick={() => setView('map')}><MapPinned size={17} /></button>
          </div>
        </div>
      </div>

      {status === 'abandoned' ? abandoned.length ? (
        <section className="panel table-panel order-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Checkout</th>
                <th>Customer</th>
                <th>Items in Cart</th>
                <th>Value</th>
                <th>Status</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Recovery Actions</th>
              </tr>
            </thead>
            <tbody>
              {abandoned.map((chk) => {
                const itemsText = (chk.items || []).map((it) => `${it.quantity}x ${it.title}`).join(', ');
                const waPhone = (chk.customer_phone || '').replace(/[^0-9]/g, '');
                const waMsg = encodeURIComponent(`Hi ${chk.customer_name || 'there'}! You left ${itemsText || 'items'} in your REIHH Studio bag (${money(chk.total_amount)}). Complete your order with 10% off using code REIHH10.`);
                const isRecovered = chk.recovery_status === 'recovered';
                return (
                  <tr key={chk.id}>
                    <td><strong>{chk.checkout_token}</strong></td>
                    <td>
                      <div className="order-customer-cell">
                        <strong>{chk.customer_name || 'Guest Shopper'}</strong>
                        <small>{chk.customer_email || chk.customer_phone || 'No contact entered yet'}</small>
                      </div>
                    </td>
                    <td style={{ maxWidth: 260, fontSize: 12 }}>{itemsText || 'Cart items'}</td>
                    <td><strong>{money(chk.total_amount)}</strong></td>
                    <td>
                      <span className={`status-pill ${isRecovered ? 'delivered' : 'pending'}`}>
                        {isRecovered ? 'Recovered' : 'Not recovered'}
                      </span>
                    </td>
                    <td>{formatDate(chk.updated_at || chk.created_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {!isRecovered && canCreate && (
                          <>
                            <button className="text-btn" onClick={() => recoverAbandonedCheckout(chk, 'draft')}>
                              Save as Draft
                            </button>
                            <button className="text-btn" onClick={() => recoverAbandonedCheckout(chk, 'pending')}>
                              Create Order
                            </button>
                          </>
                        )}
                        <a
                          className="text-btn"
                          href={`https://wa.me/${waPhone}?text=${waMsg}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Send WhatsApp recovery reminder"
                        >
                          WhatsApp
                        </a>
                        {canStatus && (
                          <button className="text-btn danger" onClick={() => dismissAbandonedCheckout(chk)} title="Dismiss">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', gap: 12, padding: '48px 0' }}>
          <EmptyState icon={ShoppingCart} text="No abandoned checkouts yet. Open Storefront Checkout without paying to see them appear here automatically." />
          <button className="outline-btn" onClick={() => window.open('/store/demo', '_blank')}>Open Demo Storefront ↗</button>
        </div>
      ) : status === 'simulations' ? simulations.length ? (
        <section className="panel table-panel order-table-panel simulation-table-panel">
          <table className="data-table">
            <thead><tr><th>Simulation</th><th>Customer</th><th>Items</th><th>Total</th><th>Created</th><th>Delivery Status</th></tr></thead>
            <tbody>{simulations.map((sim) => {
              const itemsText = Array.isArray(sim.items)
                ? sim.items.map((it) => `${it.quantity}x ${it.title}`).join(', ')
                : String(sim.items || '');
              return (
                <tr key={sim.id}>
                  <td>
                    <a href={`/track/${encodeURIComponent(sim.reference)}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: 'var(--teal)' }}>
                      {sim.reference} <ExternalLink size={11} style={{ display: 'inline' }} />
                    </a>
                  </td>
                  <td>
                    <div className="order-customer-cell">
                      <strong>{sim.customer_name}</strong>
                      <small>{sim.customer_email}</small>
                    </div>
                  </td>
                  <td style={{ maxWidth: 260, fontSize: 12 }}>{itemsText}</td>
                  <td>{money(sim.total_amount)}</td>
                  <td>{formatDate(sim.created_at)}</td>
                  <td>
                    <span className={`status-pill ${sim.delivery_status === 'delivered' ? 'delivered' : sim.delivery_status === 'returned_to_store' ? 'returned' : 'shipped'}`}>
                      {deliveryStageLabel(sim.delivery_status)}
                    </span>
                  </td>
                </tr>
              );
            })}</tbody>
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
                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>Integrated with Central Logistics Hub</div>
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
                            <strong>AWB:</strong> {o.tracking_number} ({o.tracking_company || 'Express Logistics'})
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
                  Carrier: <strong>{selectedMapOrder.tracking_company || 'Express Logistics'}</strong>
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
        <section className="panel table-panel order-table-panel" style={{ position: 'relative' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 34, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="Select all orders"
                  />
                </th>
                <th style={{ width: '13%' }}>Order</th>
                <th style={{ width: '21%' }}>Customer</th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '20%' }}>Carrier &amp; AWB</th>
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
                  isSelected={selectedOrderIds.has(order.id)}
                  onToggleSelect={toggleSelectOrder}
                  canStatus={canStatus}
                  canInvoice={canInvoice}
                  onChangeStatus={changeStatus}
                  onInvoice={invoice}
                  onEditShipping={openEditShipping}
                  onCancelOrder={cancelOrder}
                  onReturnOrder={returnOrder}
                  onDelhiveryScan={openDelhiveryModal}
                />
              ))}
            </tbody>
          </table>

          {/* Floating Bulk Actions Bar (Shopify-Style) */}
          {selectedOrderIds.size > 0 && (
            <div
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 12px 36px rgba(0,0,0,0.28)',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                <span>{selectedOrderIds.size} orders selected</span>
              </div>
              <div style={{ height: 18, width: 1, background: 'var(--border)' }} />
              {canStatus && (
                <>
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => handleBatchStatus('confirmed')}
                  >
                    Mark Confirmed
                  </button>
                  <button
                    type="button"
                    className="outline-btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => handleBatchStatus('delivered')}
                  >
                    Mark Delivered
                  </button>
                </>
              )}
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={handleBatchPrintSlips}
              >
                <Printer size={13} /> Batch Slips
              </button>
              <button
                type="button"
                className="primary-btn"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={handleExportCsv}
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                type="button"
                className="text-btn"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={() => setSelectedOrderIds(new Set())}
              >
                Deselect
              </button>
            </div>
          )}
        </section>
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', gap: 14, padding: '48px 0' }}>
          <EmptyState
            icon={ClipboardList}
            text={
              search.trim()
                ? `No orders matching "${search}".`
                : status === 'all'
                ? 'No orders recorded yet.'
                : `No ${status.replace('_', ' ')} orders.`
            }
          />
          {(status !== 'all' || search.trim()) && (
            <button
              type="button"
              className="outline-btn"
              onClick={() => { setStatus('all'); setSearch(''); }}
              style={{ fontSize: 12, borderRadius: 20, padding: '6px 16px' }}
            >
              Reset filters &amp; view all orders ({orders.length})
            </button>
          )}
        </div>
      )}

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

            {/* Quick Barcode / SKU Add Input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: '8px 10px', background: 'var(--panel-alt)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <Barcode size={16} style={{ color: 'var(--teal)' }} />
              <input
                placeholder="Scan barcode or type SKU to quick-add item…"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeScan(); } }}
                style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
              />
              <button type="button" className="outline-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={handleBarcodeScan}>
                + Add
              </button>
            </div>

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
                {discountValidationMsg && !appliedDiscount && (
                  <small style={{ color: '#ef4444', display: 'block', marginTop: 4, fontSize: 11 }}>
                    {discountValidationMsg}
                  </small>
                )}
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

            <label>Order Type (Actual vs Demo)
              <select value={form.channel || 'real'} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="real">Actual Business Order (Real Payment)</option>
                <option value="demo">Demo / Sandbox Order</option>
              </select>
            </label>

            <label>Order Notes / Delivery Instructions
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Leave package with guard" />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="outline-btn"
                type="button"
                disabled={!form.customer_id || subtotal <= 0}
                onClick={(event) => save(event, 'draft', 'demo')}
              >
                Save Demo Draft
              </button>
              <button
                className="outline-btn"
                type="button"
                disabled={!form.customer_id || subtotal <= 0}
                onClick={(event) => save(event, 'draft', 'real')}
              >
                Save Real Draft
              </button>
              <button className="primary-btn" type="submit" disabled={!form.customer_id || subtotal <= 0}>
                Create Order ({money(grandTotal)})
              </button>
            </div>
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
                  placeholder="e.g. Express Logistics, Blue Dart"
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

      {/* Delhivery Courier Scan Simulator Modal */}
      {delhiveryOrder && (
        <Modal title={`Delhivery Carrier Update · #${delhiveryOrder.order_number}`} onClose={() => setDelhiveryOrder(null)}>
          <form className="stack-form" onSubmit={submitDelhiveryScan}>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              Push a Delhivery Express status scan to update this order&apos;s live status, map pin, and public customer tracking page (<code>/track/{delhiveryOrder.tracking_number || delhiveryOrder.order_number}</code>).
            </p>
            <label>Delhivery Scan Status
              <select
                value={delhiveryForm.status}
                onChange={(e) => setDelhiveryForm({ ...delhiveryForm, status: e.target.value })}
              >
                <option value="Confirmed">Manifested / Confirmed at DC</option>
                <option value="In Transit">Dispatched / In Transit</option>
                <option value="Out for Delivery">Out for Delivery</option>
                <option value="Delivered">Delivered (OTP Verified)</option>
                <option value="RTO Returned">RTO / Returned to Origin</option>
              </select>
            </label>
            <label>Hub / City Location
              <input
                value={delhiveryForm.location}
                onChange={(e) => setDelhiveryForm({ ...delhiveryForm, location: e.target.value })}
                placeholder="e.g. Gurugram Mother Hub, Mumbai Hub"
                required
              />
            </label>
            <label>Scan Note
              <input
                value={delhiveryForm.note}
                onChange={(e) => setDelhiveryForm({ ...delhiveryForm, note: e.target.value })}
                placeholder="Courier checkpoint note"
              />
            </label>
            <button className="primary-btn" type="submit" disabled={delhiveryBusy}>
              {delhiveryBusy ? 'Sending to site…' : 'Send Delhivery Status to Site'}
            </button>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog on Order Cancellation */}
      <ConfirmDialog
        isOpen={!!cancelModalOrder}
        title={`Cancel Order #${cancelModalOrder?.order_number}`}
        message={`Are you sure you want to cancel order #${cancelModalOrder?.order_number}? Constituent inventory stock will be atomically restored and recorded in the movement audit ledger.`}
        confirmText="Yes, Cancel Order"
        confirmVariant="danger"
        onConfirm={confirmCancelOrder}
        onCancel={() => setCancelModalOrder(null)}
      />

      {/* Confirmation Dialog on Order Return */}
      <ConfirmDialog
        isOpen={!!returnModalOrder}
        title={`Process Return · Order #${returnModalOrder?.order_number}`}
        message={`Are you sure you want to process a customer return for order #${returnModalOrder?.order_number}? Garments will be restored to inventory stock, the invoice voided, and status marked as Returned.`}
        confirmText="Confirm Customer Return & Restock"
        confirmVariant="danger"
        onConfirm={confirmReturnOrder}
        onCancel={() => setReturnModalOrder(null)}
      />
    </>
  );
}
