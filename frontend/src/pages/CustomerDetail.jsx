import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Mail, MapPin, Phone, ReceiptText, ShoppingBag, WalletCards } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { EmptyState, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([client.get(`/customers/${customerId}`), client.get(`/customers/${customerId}/orders`)]).then(([customerResponse, ordersResponse]) => {
      setCustomer(customerResponse.data);
      setOrders(ordersResponse.data || []);
    }).catch((err) => setError(apiError(err, 'Could not load customer profile')));
  }, [customerId]);

  if (error) return <><PageHeader eyebrow="CRM" title="Customer profile" /><div className="notice error">{error}</div></>;
  if (!customer) return <div className="loading compact">Loading customer profile…</div>;

  const totalSpend = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const averageOrder = orders.length ? totalSpend / orders.length : 0;
  const lastOrder = orders[0];

  return (
    <>
      <button className="back-link" onClick={() => navigate('/customers')}><ArrowLeft size={16} /> Back to customers</button>
      <PageHeader eyebrow="CRM / Customer record" title={customer.name} subtitle={customer.company || 'Individual customer'}>
        <button className="outline-btn" onClick={() => navigate('/orders')}><ShoppingBag size={16} /> Create order</button>
      </PageHeader>

      <section className="customer-hero panel">
        <div className="customer-identity"><span className="customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><div><h2>{customer.name}</h2><p className="muted">Customer since {formatDate(customer.created_at)}</p></div></div>
        <div className="customer-contact"><span><Mail size={15} /> {customer.email || 'No email added'}</span><span><Phone size={15} /> {customer.phone || 'No phone added'}</span><span><MapPin size={15} /> {customer.address || 'No address added'}</span></div>
      </section>

      <section className="customer-kpis"><article className="metric teal"><span>Total spend</span><strong>{money(totalSpend)}</strong><small>Across {orders.length} orders</small></article><article className="metric blue"><span>Average order</span><strong>{money(averageOrder)}</strong><small>Lifetime average</small></article><article className="metric yellow"><span>Outstanding</span><strong>{money(customer.outstanding_balance)}</strong><small>Balance due</small></article><article className="metric coral"><span>Last activity</span><strong>{lastOrder ? formatDate(lastOrder.created_at) : 'None'}</strong><small>{lastOrder ? `Order #${lastOrder.order_number}` : 'No orders yet'}</small></article></section>

      <div className="customer-detail-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Purchase history</p><h2>Orders with this customer</h2></div><span className="record-count">{orders.length} records</span></div>{orders.length ? <div className="customer-orders">{orders.map((order) => <details className="customer-order" key={order.id}><summary><span className="order-summary-id"><strong>#{order.order_number}</strong><small>{formatDate(order.created_at)}</small></span><span className={`status-pill ${order.status}`}>{order.status}</span><b>{money(order.total_amount)}</b><ChevronRight size={16} /></summary><div className="order-items">{order.items?.length ? order.items.map((item) => <div className="order-item" key={item.id}><span>{item.product?.name || `Product #${item.product_id}`}</span><span>{item.quantity} × {money(item.unit_price)}</span><b>{money(item.total_price)}</b></div>) : <span className="muted">No line items recorded.</span>}{order.notes && <p className="order-note">Note: {order.notes}</p>}</div></details>)}</div> : <EmptyState icon={ReceiptText} text="No orders recorded for this customer yet." />}</section><aside className="panel customer-meta"><p className="eyebrow">Account details</p><h2>Profile information</h2><dl><div><dt><Building2 size={15} /> Company</dt><dd>{customer.company || 'Not provided'}</dd></div><div><dt><ReceiptText size={15} /> GSTIN</dt><dd>{customer.gstin || 'Not provided'}</dd></div><div><dt><WalletCards size={15} /> Payment status</dt><dd className={customer.outstanding_balance > 0 ? 'text-warning' : 'text-success'}>{customer.outstanding_balance > 0 ? 'Outstanding balance' : 'Account settled'}</dd></div></dl></aside></div>
    </>
  );
}
