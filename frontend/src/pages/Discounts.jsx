import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, PauseCircle, PlayCircle, Plus, Tag, Ticket, Trash2 } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { emitWorkspaceSync } from '../utils/sync';

const BLANK_COUPON = {
  code: '',
  discount_type: 'percent',
  value: '',
  usage_limit: '',
  description: '',
  active: true,
};

export default function Discounts() {
  const { can } = useAuth();
  const toast = useToast();
  const isAdmin = can(['admin']);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK_COUPON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const load = () => {
    client.get('/integrations/dashboard')
      .then((res) => setDiscounts(res.data?.discounts || []))
      .catch((err) => setError(apiError(err, 'Could not load coupon codes')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const active = discounts.filter((d) => d.active).length;
    const redemptions = discounts.reduce((sum, d) => sum + (d.times_used || 0), 0);
    return { total: discounts.length, active, paused: discounts.length - active, redemptions };
  }, [discounts]);

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        discount_type: form.discount_type,
        value: Number(form.value),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        description: form.description.trim() || null,
        active: true,
      };
      const { data: created } = await client.post('/integrations/discounts', payload);
      setDiscounts((prev) => {
        const idx = prev.findIndex((d) => d.id === created.id || d.code === created.code);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = created;
          return copy;
        }
        return [created, ...prev];
      });
      setForm(BLANK_COUPON);
      setModalOpen(false);
      setNotice(`Coupon ${created.code} is now live on your storefront and orders.`);
      toast?.success(`Coupon ${created.code} created`);
      emitWorkspaceSync('discounts');
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save coupon code'));
      toast?.error(apiError(err, 'Could not save coupon code'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDiscount = async (item) => {
    try {
      const { data: updated } = await client.patch(`/integrations/discounts/${item.id}`, {
        code: item.code,
        discount_type: item.discount_type,
        value: item.value,
        active: !item.active,
        usage_limit: item.usage_limit ?? null,
        description: item.description ?? '',
      });
      setDiscounts((prev) => prev.map((d) => (d.id === item.id ? updated : d)));
      toast?.success(`Coupon ${item.code} ${updated.active ? 'activated' : 'paused'}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      toast?.error(apiError(err, 'Could not update coupon'));
    }
  };

  const removeDiscount = async (item) => {
    try {
      await client.delete(`/integrations/discounts/${item.id}`);
      setDiscounts((prev) => prev.filter((d) => d.id !== item.id));
      toast?.info(`Deleted coupon ${item.code}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      toast?.error(apiError(err, 'Could not delete coupon'));
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    toast?.success(`Copied ${code}`);
    setTimeout(() => setCopiedCode(''), 1800);
  };

  return (
    <>
      <PageHeader
        eyebrow="Promotions"
        title="Discounts & Coupon Codes"
        subtitle="Create and manage Shopify-style promo codes synced live with checkout, orders, and storefront."
      >
        {isAdmin && (
          <button className="primary-btn heading-btn" onClick={() => { setForm(BLANK_COUPON); setModalOpen(true); }}>
            <Plus size={14} /> Create coupon
          </button>
        )}
      </PageHeader>

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="metric-grid" style={{ marginBottom: 22 }}>
        <article className="metric teal">
          <span>Active coupons</span>
          <strong>{stats.active}</strong>
          <small>{stats.total} total configured</small>
        </article>
        <article className="metric blue">
          <span>Total redemptions</span>
          <strong>{stats.redemptions}</strong>
          <small>Used across storefront &amp; admin orders</small>
        </article>
        <article className="metric yellow">
          <span>Paused codes</span>
          <strong>{stats.paused}</strong>
          <small>Inactive promo campaigns</small>
        </article>
        <article className="metric coral">
          <span>Storefront sync</span>
          <strong>Live</strong>
          <small>Validated at /store checkout</small>
        </article>
      </section>

      {loading ? <div className="loading compact">Loading coupon codes…</div> : discounts.length ? (
        <section className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coupon Code</th>
                <th>Offer</th>
                <th>Description</th>
                <th>Redemptions</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontWeight: 700, fontSize: 13 }}>{item.code}</code>
                      <button
                        type="button"
                        className="text-btn"
                        style={{ padding: '2px 5px' }}
                        onClick={() => copyCode(item.code)}
                        title="Copy coupon code"
                      >
                        {copiedCode === item.code ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </td>
                  <td>
                    <strong>
                      {item.discount_type === 'percent' ? `${item.value}% OFF` : `${money(item.value)} FLAT OFF`}
                    </strong>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{item.description || 'Storefront & order promotion'}</td>
                  <td>{item.times_used || 0}{item.usage_limit ? ` / ${item.usage_limit}` : ' (Unlimited)'}</td>
                  <td>
                    <span className={`status-pill ${item.active ? 'delivered' : 'draft'}`}>
                      {item.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isAdmin && (
                      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <button type="button" className="text-btn" onClick={() => toggleDiscount(item)}>
                          {item.active ? <><PauseCircle size={13} /> Pause</> : <><PlayCircle size={13} /> Activate</>}
                        </button>
                        <button type="button" className="text-btn danger" onClick={() => removeDiscount(item)} title="Delete coupon">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState icon={Ticket} text="No coupon codes yet. Create a coupon code to boost conversion on your storefront." />
      )}

      {modalOpen && (
        <Modal title="Create Discount Coupon Code" onClose={() => setModalOpen(false)}>
          <form className="stack-form" onSubmit={handleSave}>
            <label>Coupon Code*
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                placeholder="e.g. FESTIVE15"
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Discount Type
                <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </label>
              <label>Value*
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.discount_type === 'percent' ? '15' : '500'}
                />
              </label>
            </div>
            <label>Usage Limit (Optional)
              <input
                type="number"
                min="1"
                value={form.usage_limit}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                placeholder="Leave blank for unlimited"
              />
            </label>
            <label>Description / Campaign Note
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. 15% off winter launch collection"
              />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>
              <Tag size={14} /> {busy ? 'Creating…' : 'Create & Publish Coupon'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
