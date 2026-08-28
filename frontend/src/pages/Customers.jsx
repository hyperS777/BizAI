import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const blank = { name: '', email: '', phone: '', company: '', address: '', gstin: '' };

export default function Customers() {
  const { can } = useAuth();
  const canEdit = can(['admin', 'manager', 'employee']);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [history, setHistory] = useState([]);

  const load = () => {
    setLoading(true);
    client.get('/customers', { params: { search: search || undefined } })
      .then((res) => setCustomers(res.data || []))
      .catch((err) => setError(apiError(err, 'Could not load customers')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => { setForm(blank); setModal({ type: 'form' }); };
  const openEdit = (customer) => { setForm(customer); setModal({ type: 'form', id: customer.id }); };
  const openHistory = (customer) => {
    client.get(`/customers/${customer.id}/orders`).then((res) => {
      setHistory(res.data || []);
      setModal({ type: 'history', customer });
    });
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, email: form.email || null };
      if (modal.id) await client.put(`/customers/${modal.id}`, payload);
      else await client.post('/customers', payload);
      setModal(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save customer'));
    }
  };

  const remove = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    try {
      await client.delete(`/customers/${customer.id}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not delete customer'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="CRM" title="Customers" subtitle="Directory, outstanding balances, and purchase history.">
        {canEdit && <button className="primary-btn heading-btn" onClick={openCreate}>Add customer</button>}
      </PageHeader>
      <div className="toolbar">
        <input className="filter-input" placeholder="Search name, company, email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <div className="notice error">{error}</div>}
      {loading ? <div className="loading compact">Loading customers…</div> : customers.length ? (
        <section className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Company</th><th>Contact</th><th>Outstanding</th><th /></tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong></td>
                  <td>{customer.company || '—'}</td>
                  <td>{customer.email || customer.phone || '—'}</td>
                  <td>{money(customer.outstanding_balance)}</td>
                  <td className="row-actions">
                    <button className="text-btn" onClick={() => openHistory(customer)}>History</button>
                    {canEdit && <button className="text-btn" onClick={() => openEdit(customer)}>Edit</button>}
                    {canEdit && <button className="text-btn danger" onClick={() => remove(customer)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={Users} text="No customers match this search." />}

      {modal?.type === 'form' && (
        <Modal title={modal.id ? 'Edit customer' : 'Add customer'} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={save}>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Phone<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>Company<input value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
            <label>Address<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <label>GSTIN<input value={form.gstin || ''} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></label>
            <button className="primary-btn" type="submit">Save</button>
          </form>
        </Modal>
      )}

      {modal?.type === 'history' && (
        <Modal title={`${modal.customer.name} · orders`} onClose={() => setModal(null)}>
          {history.length ? history.map((order) => (
            <div className="history-row" key={order.id}>
              <strong>#{order.order_number}</strong>
              <span className={`status-pill ${order.status}`}>{order.status}</span>
              <span>{formatDate(order.created_at)}</span>
              <b>{money(order.total_amount)}</b>
            </div>
          )) : <p className="muted">No orders yet.</p>}
        </Modal>
      )}
    </>
  );
}
