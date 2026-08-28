import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  const { can } = useAuth();
  const canCreate = can(['admin', 'manager', 'employee']);
  const canStatus = can(['admin', 'manager']);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ customer_id: '', notes: '', items: [{ product_id: '', quantity: 1 }] });

  const load = () => {
    client.get('/orders', { params: { status: status || undefined } })
      .then((res) => setOrders(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    client.get('/customers').then((res) => setCustomers(res.data || []));
    client.get('/products').then((res) => setProducts(res.data || []));
  }, []);

  useEffect(() => { load(); }, [status]);

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
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {orders.length ? (
        <section className="panel table-panel">
          <table className="data-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th><th /></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><strong>#{order.order_number}</strong></td>
                  <td>{order.customer?.name || `Customer #${order.customer_id}`}</td>
                  <td>
                    {canStatus ? (
                      <select value={order.status} onChange={(e) => changeStatus(order, e.target.value)}>
                        {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    ) : <span className={`status-pill ${order.status}`}>{order.status}</span>}
                  </td>
                  <td>{money(order.total_amount)}</td>
                  <td>{formatDate(order.created_at)}</td>
                  <td><button className="text-btn" onClick={() => invoice(order)}>Invoice</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={ClipboardList} text="No orders recorded yet." />}

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
