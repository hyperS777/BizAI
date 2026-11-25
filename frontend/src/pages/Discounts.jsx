import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Edit3, Gift, Loader2, PauseCircle, PlayCircle, Plus, Tag, Ticket, Trash2 } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { emitWorkspaceSync, subscribeWorkspaceSync } from '../utils/sync';

const BLANK_COUPON = {
  code: '',
  discount_type: 'percent',
  value: '',
  usage_limit: '',
  description: '',
  active: true,
};

const BLANK_GIFT_CARD = {
  code: '',
  initial_balance: '2000',
  current_balance: '',
  recipient_name: '',
  recipient_email: '',
  note: '',
  active: true,
};

export default function Discounts() {
  const { can } = useAuth();
  const toast = useToast();
  const isAdmin = can(['admin']);
  const [section, setSection] = useState('coupons'); // 'coupons' | 'giftcards'
  const [discounts, setDiscounts] = useState([]);
  const [giftCards, setGiftCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [gcModalOpen, setGcModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingGcId, setEditingGcId] = useState(null);
  const [form, setForm] = useState(BLANK_COUPON);
  const [gcForm, setGcForm] = useState(BLANK_GIFT_CARD);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const load = () => {
    Promise.all([
      client.get('/integrations/dashboard'),
      client.get('/integrations/gift-cards').catch(() => ({ data: [] })),
    ])
      .then(([dashRes, gcRes]) => {
        setDiscounts(dashRes.data?.discounts || []);
        setGiftCards(gcRes.data || []);
      })
      .catch((err) => setError(apiError(err, 'Could not load promotions')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    return subscribeWorkspaceSync(() => load());
  }, []);

  const stats = useMemo(() => {
    const active = discounts.filter((d) => d.active).length;
    const redemptions = discounts.reduce((sum, d) => sum + (d.times_used || 0), 0);
    return { total: discounts.length, active, paused: discounts.length - active, redemptions };
  }, [discounts]);

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_COUPON);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      code: item.code || '',
      discount_type: item.discount_type || 'percent',
      value: String(item.value ?? ''),
      usage_limit: item.usage_limit ? String(item.usage_limit) : '',
      description: item.description || '',
      active: Boolean(item.active),
    });
    setModalOpen(true);
  };

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
        active: editingId ? Boolean(form.active) : true,
      };
      const { data: saved } = editingId
        ? await client.patch(`/integrations/discounts/${editingId}`, payload)
        : await client.post('/integrations/discounts', payload);

      setDiscounts((prev) => {
        const idx = prev.findIndex((d) => d.id === saved.id || d.code === saved.code);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
      setEditingId(null);
      setForm(BLANK_COUPON);
      setModalOpen(false);
      const verb = editingId ? 'updated' : 'created';
      setNotice(`Coupon ${saved.code} ${verb} and synced live with storefront and orders.`);
      toast?.success(`Coupon ${saved.code} ${verb}`);
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
    if (busyId === item.id) return;
    const nextActive = !item.active;
    // Optimistic UI update so status & button respond instantaneously
    setBusyId(item.id);
    setDiscounts((prev) => prev.map((d) => (d.id === item.id ? { ...d, active: nextActive } : d)));
    try {
      const { data: updated } = await client.patch(`/integrations/discounts/${item.id}`, {
        code: item.code,
        discount_type: item.discount_type,
        value: item.value,
        active: nextActive,
        usage_limit: item.usage_limit ?? null,
        description: item.description ?? '',
      });
      setDiscounts((prev) => prev.map((d) => (d.id === item.id ? updated : d)));
      toast?.success(`Coupon ${item.code} ${updated.active ? 'activated' : 'paused'}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      // Revert optimistic update on failure
      setDiscounts((prev) => prev.map((d) => (d.id === item.id ? { ...d, active: item.active } : d)));
      toast?.error(apiError(err, 'Could not update coupon'));
    } finally {
      setBusyId(null);
    }
  };

  const removeDiscount = async (item) => {
    if (busyId === item.id) return;
    setBusyId(item.id);
    try {
      await client.delete(`/integrations/discounts/${item.id}`);
      setDiscounts((prev) => prev.filter((d) => d.id !== item.id));
      toast?.info(`Deleted coupon ${item.code}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      toast?.error(apiError(err, 'Could not delete coupon'));
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    toast?.success(`Copied ${code}`);
    setTimeout(() => setCopiedCode(''), 1800);
  };

  const openCreateGc = () => {
    setEditingGcId(null);
    setGcForm(BLANK_GIFT_CARD);
    setGcModalOpen(true);
  };

  const openEditGc = (gc) => {
    setEditingGcId(gc.id);
    setGcForm({
      code: gc.code || '',
      initial_balance: String(gc.initial_balance ?? ''),
      current_balance: String(gc.current_balance ?? ''),
      recipient_name: gc.recipient_name || '',
      recipient_email: gc.recipient_email || '',
      note: gc.note || '',
      active: Boolean(gc.active),
    });
    setGcModalOpen(true);
  };

  const handleSaveGc = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        code: gcForm.code.trim().toUpperCase() || null,
        initial_balance: Number(gcForm.initial_balance),
        current_balance: gcForm.current_balance !== '' ? Number(gcForm.current_balance) : undefined,
        recipient_name: gcForm.recipient_name.trim() || null,
        recipient_email: gcForm.recipient_email.trim() || null,
        note: gcForm.note.trim() || null,
        active: editingGcId ? Boolean(gcForm.active) : true,
      };
      const { data: saved } = editingGcId
        ? await client.patch(`/integrations/gift-cards/${editingGcId}`, payload)
        : await client.post('/integrations/gift-cards', payload);
      setGiftCards((prev) => {
        const idx = prev.findIndex((g) => g.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
      setGcModalOpen(false);
      setEditingGcId(null);
      setGcForm(BLANK_GIFT_CARD);
      toast?.success(`Gift Card ${saved.code} ${editingGcId ? 'updated' : 'issued'}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      setError(apiError(err, 'Could not save gift card'));
      toast?.error(apiError(err, 'Could not save gift card'));
    } finally {
      setBusy(false);
    }
  };

  const toggleGiftCard = async (gc) => {
    if (busyId === `gc-${gc.id}`) return;
    const nextActive = !gc.active;
    setBusyId(`gc-${gc.id}`);
    setGiftCards((prev) => prev.map((g) => (g.id === gc.id ? { ...g, active: nextActive } : g)));
    try {
      const { data: updated } = await client.patch(`/integrations/gift-cards/${gc.id}`, {
        code: gc.code,
        initial_balance: gc.initial_balance,
        current_balance: gc.current_balance,
        recipient_name: gc.recipient_name,
        recipient_email: gc.recipient_email,
        note: gc.note,
        active: nextActive,
      });
      setGiftCards((prev) => prev.map((g) => (g.id === gc.id ? updated : g)));
      toast?.success(`Gift Card ${gc.code} ${updated.active ? 'activated' : 'paused'}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      setGiftCards((prev) => prev.map((g) => (g.id === gc.id ? { ...g, active: gc.active } : g)));
      toast?.error(apiError(err, 'Could not update gift card'));
    } finally {
      setBusyId(null);
    }
  };

  const removeGiftCard = async (gc) => {
    if (busyId === `gc-${gc.id}`) return;
    setBusyId(`gc-${gc.id}`);
    try {
      await client.delete(`/integrations/gift-cards/${gc.id}`);
      setGiftCards((prev) => prev.filter((g) => g.id !== gc.id));
      toast?.info(`Deleted gift card ${gc.code}`);
      emitWorkspaceSync('discounts');
    } catch (err) {
      toast?.error(apiError(err, 'Could not delete gift card'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Promotions"
        title="Discounts & Gift Cards"
        subtitle="Manage Shopify-style coupon codes and stored-value gift cards synced live with /store checkout."
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="segmented-control">
            <button type="button" className={`segmented-btn ${section === 'coupons' ? 'active' : ''}`} onClick={() => setSection('coupons')}>
              <Ticket size={13} /> Coupons ({discounts.length})
            </button>
            <button type="button" className={`segmented-btn ${section === 'giftcards' ? 'active' : ''}`} onClick={() => setSection('giftcards')}>
              <Gift size={13} /> Gift Cards ({giftCards.length})
            </button>
          </div>
          {isAdmin && section === 'coupons' && (
            <button className="primary-btn heading-btn" onClick={openCreate}>
              <Plus size={14} /> Create coupon
            </button>
          )}
          {isAdmin && section === 'giftcards' && (
            <button className="primary-btn heading-btn" onClick={openCreateGc}>
              <Gift size={14} /> Issue Gift Card
            </button>
          )}
        </div>
      </PageHeader>

      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      {section === 'coupons' ? (
        <>
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
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="text-btn"
                          disabled={busyId === item.id}
                          onClick={() => toggleDiscount(item)}
                        >
                          {busyId === item.id
                            ? <><Loader2 size={13} className="spin-animation" /> Updating…</>
                            : item.active
                              ? <><PauseCircle size={13} /> Pause</>
                              : <><PlayCircle size={13} /> Activate</>}
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          disabled={busyId === item.id}
                          onClick={() => openEdit(item)}
                          title="Edit coupon"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="text-btn danger"
                          disabled={busyId === item.id}
                          onClick={() => removeDiscount(item)}
                          title="Delete coupon"
                        >
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
        </>
      ) : (
        <>
          <section className="metric-grid" style={{ marginBottom: 22 }}>
            <article className="metric teal">
              <span>Active gift cards</span>
              <strong>{giftCards.filter((g) => g.active && g.current_balance > 0).length}</strong>
              <small>{giftCards.length} total issued</small>
            </article>
            <article className="metric blue">
              <span>Outstanding liability</span>
              <strong>{money(giftCards.filter((g) => g.active).reduce((s, g) => s + Number(g.current_balance || 0), 0))}</strong>
              <small>Remaining redeemable balance</small>
            </article>
            <article className="metric yellow">
              <span>Total issued value</span>
              <strong>{money(giftCards.reduce((s, g) => s + Number(g.initial_balance || 0), 0))}</strong>
              <small>Store credit &amp; gifted value</small>
            </article>
            <article className="metric coral">
              <span>Checkout redemption</span>
              <strong>Live</strong>
              <small>Deducted automatically at /store</small>
            </article>
          </section>

          {loading ? <div className="loading compact">Loading gift cards…</div> : giftCards.length ? (
            <section className="panel table-panel">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gift Card Code</th>
                    <th>Remaining Balance</th>
                    <th>Initial Value</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {giftCards.map((gc) => (
                    <tr key={gc.id}>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <code style={{ fontWeight: 700, fontSize: 13 }}>{gc.code}</code>
                          <button type="button" className="text-btn" style={{ padding: '2px 5px' }} onClick={() => copyCode(gc.code)} title="Copy gift card code">
                            {copiedCode === gc.code ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                      <td><strong>{money(gc.current_balance)}</strong></td>
                      <td style={{ color: 'var(--muted)' }}>{money(gc.initial_balance)}</td>
                      <td>
                        <div>{gc.recipient_name || 'Bearer Card'}</div>
                        {gc.recipient_email && <small style={{ color: 'var(--muted)' }}>{gc.recipient_email}</small>}
                      </td>
                      <td>
                        <span className={`status-pill ${gc.active ? (gc.current_balance > 0 ? 'delivered' : 'pending') : 'draft'}`}>
                          {gc.active ? (gc.current_balance > 0 ? 'Active' : 'Depleted') : 'Paused'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isAdmin && (
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button type="button" className="text-btn" disabled={busyId === `gc-${gc.id}`} onClick={() => toggleGiftCard(gc)}>
                              {busyId === `gc-${gc.id}`
                                ? <><Loader2 size={13} className="spin-animation" /> Updating…</>
                                : gc.active
                                  ? <><PauseCircle size={13} /> Pause</>
                                  : <><PlayCircle size={13} /> Activate</>}
                            </button>
                            <button type="button" className="text-btn" disabled={busyId === `gc-${gc.id}`} onClick={() => openEditGc(gc)}>
                              <Edit3 size={13} /> Edit
                            </button>
                            <button type="button" className="text-btn danger" disabled={busyId === `gc-${gc.id}`} onClick={() => removeGiftCard(gc)}>
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
            <EmptyState icon={Gift} text="No gift cards issued yet. Issue a stored-value gift card for VIP shoppers or refunds." />
          )}
        </>
      )}

      {gcModalOpen && (
        <Modal
          title={editingGcId ? `Edit Gift Card ${gcForm.code || ''}`.trim() : 'Issue New Gift Card'}
          onClose={() => { setGcModalOpen(false); setEditingGcId(null); }}
        >
          <form className="stack-form" onSubmit={handleSaveGc}>
            <label>Gift Card Code (Leave blank to auto-generate)
              <input
                value={gcForm.code}
                onChange={(e) => setGcForm({ ...gcForm, code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                placeholder="e.g. GIFT-VIP-2026"
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Initial Value (₹)*
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={gcForm.initial_balance}
                  onChange={(e) => setGcForm({ ...gcForm, initial_balance: e.target.value })}
                />
              </label>
              <label>Current Balance (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={gcForm.current_balance}
                  onChange={(e) => setGcForm({ ...gcForm, current_balance: e.target.value })}
                  placeholder="Defaults to initial value"
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Recipient Name
                <input value={gcForm.recipient_name} onChange={(e) => setGcForm({ ...gcForm, recipient_name: e.target.value })} placeholder="Customer name" />
              </label>
              <label>Recipient Email
                <input type="email" value={gcForm.recipient_email} onChange={(e) => setGcForm({ ...gcForm, recipient_email: e.target.value })} placeholder="customer@email.com" />
              </label>
            </div>
            <label>Note
              <input value={gcForm.note} onChange={(e) => setGcForm({ ...gcForm, note: e.target.value })} placeholder="e.g. VIP loyalty store credit" />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin-animation" /> : <Gift size={14} />}
              {busy ? 'Saving…' : (editingGcId ? 'Save Gift Card Changes' : 'Issue Gift Card')}
            </button>
          </form>
        </Modal>
      )}

      {modalOpen && (
        <Modal
          title={editingId ? `Edit Coupon ${form.code || ''}`.trim() : 'Create Discount Coupon Code'}
          onClose={() => { setModalOpen(false); setEditingId(null); }}
        >
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
            {editingId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                <span>Coupon is active and redeemable at checkout</span>
              </label>
            )}
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? <Loader2 size={14} className="spin-animation" /> : <Tag size={14} />}
              {busy ? (editingId ? 'Saving changes…' : 'Creating…') : (editingId ? 'Save Coupon Changes' : 'Create & Publish Coupon')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
