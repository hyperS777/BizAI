import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Download, Upload, Plus, Tag, ShieldCheck, Trash2 } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TIERS = [
  { id: 'VIP', label: 'VIP Concierge Customer', color: '#8b5cf6' },
  { id: 'Wholesale', label: 'Wholesale / B2B Retailer', color: '#3b82f6' },
  { id: 'Repeat', label: 'Repeat Loyal Customer', color: '#10b981' },
  { id: 'Regular', label: 'Regular Client', color: '#6b7280' },
  { id: 'New', label: 'First-time Buyer', color: '#f59e0b' },
];

const blank = {
  name: '',
  email: '',
  phone: '',
  company: '',
  tier: 'Regular',
  tags: '',
  address: '',
  billing_address: '',
  gstin: '',
  notes: '',
};

export default function Customers() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canEdit = can(['admin', 'manager', 'employee']);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
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
  const openEdit = (customer) => {
    setForm({
      ...customer,
      tier: customer.tier || 'Regular',
      tags: customer.tags || '',
      billing_address: customer.billing_address || '',
      notes: customer.notes || '',
    });
    setModal({ type: 'form', id: customer.id });
  };

  const openHistory = (customer) => {
    client.get(`/customers/${customer.id}/orders`).then((res) => {
      setHistory(res.data || []);
      setModal({ type: 'history', customer });
    });
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
      };
      if (modal.id) {
        await client.put(`/customers/${modal.id}`, payload);
        toast?.success(`Updated ${payload.name}`);
      } else {
        await client.post('/customers', payload);
        toast?.success(`Customer ${payload.name} added`);
      }
      setModal(null);
      setNotice('Customer profile saved.');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save customer'));
      toast?.error(apiError(err, 'Could not save customer'));
    }
  };

  const remove = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    try {
      await client.delete(`/customers/${customer.id}`);
      setNotice(`Customer ${customer.name} deleted.`);
      toast?.info(`Removed ${customer.name}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not delete customer'));
      toast?.error('Could not delete customer');
    }
  };

  const exportCsv = () => {
    window.open(`${client.defaults.baseURL}/customers/export`, '_blank');
    toast?.success('Exporting customers CSV…');
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await client.post('/customers/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNotice(`Imported/updated ${res.data.imported_or_updated} customer records successfully.`);
      setImportModal(false);
      setImportFile(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to import customers'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="CRM" title="Customers" subtitle="Customer directory, account tiers, GSTIN records, outstanding AR, and lifetime history.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="outline-btn heading-btn" onClick={exportCsv} title="Download CSV contacts">
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button className="outline-btn heading-btn" onClick={() => setImportModal(true)} title="Bulk upload customers">
              <Upload size={14} /> Import CSV
            </button>
          )}
          {canEdit && (
            <button className="primary-btn heading-btn" onClick={openCreate}>
              <Plus size={14} /> Add customer
            </button>
          )}
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="toolbar">
        <input className="filter-input" placeholder="Search customer name, company, email, phone, or tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="loading compact">Loading customers…</div> : customers.length ? (
        <section className="panel table-panel customer-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Tier &amp; Tags</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Outstanding AR</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const tierInfo = TIERS.find((t) => t.id === customer.tier) || TIERS[3];
                return (
                  <tr key={customer.id}>
                    <td>
                      <button className="customer-name" onClick={() => navigate(`/customers/${customer.id}`)}>
                        <strong>{customer.name}</strong>
                        <small>View 360° profile</small>
                      </button>
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          background: `${tierInfo.color}15`,
                          color: tierInfo.color,
                          borderColor: `${tierInfo.color}40`,
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                      >
                        {customer.tier || 'Regular'}
                      </span>
                      {customer.tags && (
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                          {customer.tags}
                        </small>
                      )}
                    </td>
                    <td>
                      <span>{customer.company || '—'}</span>
                      {customer.gstin && <small style={{ display: 'block', color: 'var(--muted)', fontSize: 10 }}>GSTIN: {customer.gstin}</small>}
                    </td>
                    <td>
                      <div>{customer.email || '—'}</div>
                      <small style={{ color: 'var(--muted)' }}>{customer.phone || ''}</small>
                    </td>
                    <td>
                      <b style={{ color: customer.outstanding_balance > 0 ? '#ef4444' : '#10b981' }}>
                        {money(customer.outstanding_balance)}
                      </b>
                    </td>
                    <td className="row-actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="text-btn" onClick={() => openHistory(customer)}>History</button>
                        {canEdit && <button className="text-btn" onClick={() => openEdit(customer)}>Edit</button>}
                        {canEdit && (
                          <button className="text-btn danger" onClick={() => remove(customer)} title="Delete customer">
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
      ) : <EmptyState icon={Users} text="No customers match this search." />}

      {/* Customer Form Modal */}
      {modal?.type === 'form' && (
        <Modal title={modal.id ? `Edit Customer · ${form.name}` : 'Add New Customer Profile'} onClose={() => setModal(null)}>
          <form className="stack-form" onSubmit={save} style={{ maxHeight: '76vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
              <label>Full Name*
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Sharma" required />
              </label>
              <label>Customer Tier*
                <select value={form.tier || 'Regular'} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                  {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Email
                <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@email.com" />
              </label>
              <label>Phone / WhatsApp
                <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98100 12345" />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Company / Studio
                <input value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Vogue India Stylist" />
              </label>
              <label>GSTIN (For B2B Invoicing)
                <input value={form.gstin || ''} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="e.g. 07AAACR1234F1Z5" />
              </label>
            </div>

            <label>Customer Tags
              <input value={form.tags || ''} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. Delhi HNI, Repeat Buyer, Haute Couture, Tailoring" />
            </label>

            <label>Shipping / Delivery Address
              <textarea rows={2} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address for garment dispatches" />
            </label>

            <label>Billing Address (If different from delivery)
              <textarea rows={2} value={form.billing_address || ''} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} placeholder="Registered legal billing address" />
            </label>

            <label>Internal Profile Notes
              <textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Sizing preferences, favored silhouettes, VIP preferences" />
            </label>

            <button className="primary-btn" type="submit">
              {modal.id ? 'Update Profile' : 'Save Customer Record'}
            </button>
          </form>
        </Modal>
      )}

      {/* Purchase History Modal */}
      {modal?.type === 'history' && (
        <Modal title={`${modal.customer.name} · Orders History`} onClose={() => setModal(null)}>
          {history.length ? (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {history.map((order) => (
                <div className="history-row" key={order.id}>
                  <strong>#{order.order_number}</strong>
                  <span className={`status-pill ${order.status}`}>{order.status}</span>
                  <span>{formatDate(order.created_at)}</span>
                  <b>{money(order.total_amount)}</b>
                </div>
              ))}
            </div>
          ) : <p className="muted">No orders recorded for this customer yet.</p>}
        </Modal>
      )}

      {/* CSV Import Modal */}
      {importModal && (
        <Modal title="Bulk Import Customers (CSV)" onClose={() => setImportModal(false)}>
          <form className="stack-form" onSubmit={handleImportSubmit}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              Upload a CSV file with columns: <code>Name, Email, Phone, Company, Tier, Tags, Address, BillingAddress, GSTIN</code>.
            </p>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', background: '#fafafa' }}>
              <Upload size={28} style={{ color: 'var(--teal)', margin: '0 auto 8px' }} />
              <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} required />
              {importFile && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal)' }}>
                  Selected: <strong>{importFile.name}</strong>
                </div>
              )}
            </div>
            <button className="primary-btn" type="submit" disabled={importing || !importFile}>
              {importing ? 'Importing…' : 'Start CSV Import'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
