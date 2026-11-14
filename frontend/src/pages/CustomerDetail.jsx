import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Mail, MapPin, Phone, ReceiptText, ShoppingBag, WalletCards, Tag, Edit, Save, Check } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { EmptyState, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useToast } from '../context/ToastContext';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    Promise.all([client.get(`/customers/${customerId}`), client.get(`/customers/${customerId}/orders`)])
      .then(([customerResponse, ordersResponse]) => {
        setCustomer(customerResponse.data);
        setNotes(customerResponse.data?.notes || '');
        setOrders(ordersResponse.data || []);
      })
      .catch((err) => setError(apiError(err, 'Could not load customer profile')));
  }, [customerId]);

  const saveNotes = async () => {
    setSavingNotes(true);
    setNotice('');
    try {
      await client.put(`/customers/${customerId}`, { notes });
      setNotice('Customer interaction note saved.');
      toast?.success('Interaction notes saved');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(apiError(err, 'Could not save note'));
      toast?.error('Could not save interaction note');
    } finally {
      setSavingNotes(false);
    }
  };

  if (error) return <><PageHeader eyebrow="CRM" title="Customer profile" /><div className="notice error">{error}</div></>;
  if (!customer) return <div className="loading compact">Loading customer profile…</div>;

  const totalSpend = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const averageOrder = orders.length ? totalSpend / orders.length : 0;
  const lastOrder = orders[0];

  return (
    <>
      <button className="back-link" onClick={() => navigate('/customers')}><ArrowLeft size={16} /> Back to customers</button>
      <PageHeader eyebrow="CRM / Customer 360°" title={customer.name} subtitle={customer.company || 'Individual Client'}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="status-pill" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#c4b5fd', fontWeight: 600 }}>
            {customer.tier || 'Regular'} Tier
          </span>
          <button className="outline-btn" onClick={() => navigate('/orders')}><ShoppingBag size={16} /> Create order</button>
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}

      <section className="customer-hero panel">
        <div className="customer-identity">
          <span className="customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2>{customer.name}</h2>
            <p className="muted">Customer since {formatDate(customer.created_at)}</p>
            {customer.tags && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {customer.tags.split(',').map((tag, i) => (
                  <span key={i} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 500 }}>
                    #{tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="customer-contact">
          <span><Mail size={15} /> {customer.email || 'No email added'}</span>
          <span><Phone size={15} /> {customer.phone || 'No phone added'}</span>
          <span><MapPin size={15} /> Shipping: {customer.address || 'No shipping address'}</span>
          {customer.billing_address && (
            <span><Building2 size={15} /> Billing: {customer.billing_address}</span>
          )}
        </div>
      </section>

      <section className="customer-kpis">
        <article className="metric teal">
          <span>Lifetime Spend</span>
          <strong>{money(totalSpend)}</strong>
          <small>Across {orders.length} orders</small>
        </article>
        <article className="metric blue">
          <span>Average Order</span>
          <strong>{money(averageOrder)}</strong>
          <small>Lifetime average</small>
        </article>
        <article className="metric yellow">
          <span>Outstanding AR</span>
          <strong style={{ color: customer.outstanding_balance > 0 ? '#ef4444' : 'inherit' }}>
            {money(customer.outstanding_balance)}
          </strong>
          <small>{customer.outstanding_balance > 0 ? 'Payment pending' : 'All invoices settled'}</small>
        </article>
        <article className="metric coral">
          <span>Last Purchase</span>
          <strong>{lastOrder ? formatDate(lastOrder.created_at) : 'None'}</strong>
          <small>{lastOrder ? `Order #${lastOrder.order_number}` : 'No orders yet'}</small>
        </article>
      </section>

      <div className="customer-detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Purchase history</p>
              <h2>Orders with this customer</h2>
            </div>
            <span className="record-count">{orders.length} records</span>
          </div>
          {orders.length ? (
            <div className="customer-orders">
              {orders.map((order) => (
                <details className="customer-order" key={order.id}>
                  <summary>
                    <span className="order-summary-id">
                      <strong>#{order.order_number}</strong>
                      <small>{formatDate(order.created_at)}</small>
                    </span>
                    <span className={`status-pill ${order.status}`}>{order.status}</span>
                    <b>{money(order.total_amount)}</b>
                    <ChevronRight size={16} />
                  </summary>
                  <div className="order-items">
                    {order.items?.length ? order.items.map((item) => (
                      <div className="order-item" key={item.id}>
                        <span>{item.product?.name || `Product #${item.product_id}`}</span>
                        <span>{item.quantity} × {money(item.unit_price)}</span>
                        <b>{money(item.total_price)}</b>
                      </div>
                    )) : <span className="muted">No line items recorded.</span>}
                    {order.notes && <p className="order-note">Note: {order.notes}</p>}
                  </div>
                </details>
              ))}
            </div>
          ) : <EmptyState icon={ReceiptText} text="No orders recorded for this customer yet." />}
        </section>

        <aside className="panel customer-meta">
          <p className="eyebrow">Account details</p>
          <h2>Profile &amp; Notes</h2>
          <dl>
            <div>
              <dt><Building2 size={15} /> Company</dt>
              <dd>{customer.company || 'Not provided'}</dd>
            </div>
            <div>
              <dt><ReceiptText size={15} /> GSTIN</dt>
              <dd>{customer.gstin || 'Unregistered (B2C)'}</dd>
            </div>
            <div>
              <dt><WalletCards size={15} /> Payment status</dt>
              <dd className={customer.outstanding_balance > 0 ? 'text-warning' : 'text-success'}>
                {customer.outstanding_balance > 0 ? 'Outstanding balance' : 'Account settled'}
              </dd>
            </div>
          </dl>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <strong style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Interaction Notes &amp; Fit Profile</strong>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prefers oversized straight fit denim. Tailored inseam 30in. VIP styling notes."
              style={{ width: '100%', fontSize: 12, borderRadius: 6 }}
            />
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={saveNotes}
              disabled={savingNotes}
            >
              <Save size={13} /> {savingNotes ? 'Saving…' : 'Save Notes'}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
