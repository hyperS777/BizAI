import { useEffect, useState } from 'react';
import { Activity, Check, CircleAlert, PlugZap, Plus, Save, Store, Webhook } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const initialWebhook = { name: '', url: '', secret: '', events: 'order.created,order.confirmed,order.cancelled,invoice.created,invoice.paid,inventory.low_stock', enabled: true };
const initialDiscount = { code: '', discount_type: 'percent', value: '', description: '' };

export default function Integrations() {
  const { can } = useAuth();
  const isAdmin = can(['admin']);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({});
  const [webhook, setWebhook] = useState(initialWebhook);
  const [discount, setDiscount] = useState(initialDiscount);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    return client.get('/integrations/dashboard').then((res) => {
      setData(res.data);
      setOptions(res.data.settings || {});
    }).catch((err) => setError(apiError(err, 'Could not load integration settings')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const saveOptions = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = {
        auto_invoice_on_confirm: options.auto_invoice_on_confirm === true || options.auto_invoice_on_confirm === 'true',
        auto_mark_overdue: options.auto_mark_overdue === true || options.auto_mark_overdue === 'true',
        store_channel: options.store_channel,
        store_currency: options.store_currency,
        cancel_lock_after: options.cancel_lock_after,
      };
      await client.patch('/integrations/settings', payload);
      await load();
      setNotice('Options saved.');
    } catch (err) {
      setError(apiError(err, 'Could not save options'));
    } finally {
      setBusy(false);
    }
  };

  const addWebhook = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await client.post('/integrations/webhooks', webhook);
      setWebhook(initialWebhook);
      await load();
      setNotice('Webhook endpoint added.');
    } catch (err) {
      setError(apiError(err, 'Could not add webhook'));
    }
  };

  const addDiscount = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await client.post('/integrations/discounts', { ...discount, value: Number(discount.value) });
      setDiscount(initialDiscount);
      await load();
      setNotice('Discount code added.');
    } catch (err) {
      setError(apiError(err, 'Could not add discount code'));
    }
  };

  const syncCatalog = async () => {
    setSyncBusy(true); setError(''); setNotice('');
    try {
      const result = await client.post('/integrations/shopify/sync');
      await load();
      setNotice(`Store sync complete: ${result.data.products_synced} products, ${result.data.orders_imported} new orders, ${result.data.orders_updated} updated orders.`);
    } catch (err) {
      setError(apiError(err, 'Could not sync the Shopify catalog'));
    } finally {
      setSyncBusy(false);
    }
  };

  if (loading && !data) return <div className="loading">Loading integration settings…</div>;
  if (!data) return (
    <>
      <PageHeader eyebrow="Commerce operations" title="Integrations" subtitle="Store connection, automation rules, webhooks and discounts." />
      <div className="notice error">{error || 'Could not load integration settings.'}</div>
      <button className="outline-btn" onClick={load}>Retry connection</button>
    </>
  );

  return (
    <>
      <PageHeader eyebrow="Commerce operations" title="Integrations" subtitle="Store connection, automation rules, webhooks and discounts.">
        {isAdmin && data.store?.configured && <button className="primary-btn" onClick={syncCatalog} disabled={syncBusy}><PlugZap size={16} /> {syncBusy ? 'Syncing store…' : 'Sync store now'}</button>}
      </PageHeader>
      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice success"><Check size={16} /> {notice}</div>}

      <section className="metric-grid integration-status-grid">
        <article className="metric teal"><span>Store</span><strong>{data.store?.domain || data.store?.channel || 'REIHH'}</strong><small>{data.store?.configured ? 'Connected' : 'Connection not configured'}</small></article>
        <article className="metric blue"><span>Base currency</span><strong>{data.store?.currency || 'INR'}</strong><small>Storefront checkout remains on Shopify</small></article>
        <article className="metric yellow"><span>Webhook endpoints</span><strong>{data.webhooks?.filter((item) => item.enabled).length || 0}</strong><small>Enabled endpoints</small></article>
        <article className="metric coral"><span>Recent events</span><strong>{data.events?.length || 0}</strong><small>Latest recorded integration activity</small></article>
      </section>

      {!data.store?.configured && (
        <div className="notice"><CircleAlert size={16} /> Live Shopify sync is not configured. The store must authorize API access and provide verified webhook credentials before real orders or inventory can sync.</div>
      )}
      {data.store?.configured && !data.store?.invoice_links_ready && (
        <div className="notice"><CircleAlert size={16} /> Add `PUBLIC_API_BASE_URL` on the API host to publish customer invoice links to Shopify orders.</div>
      )}

      <section className="panel integration-panel">
        <div className="panel-heading"><div><p className="eyebrow">Options</p><h2>Automation and store rules</h2></div><PlugZap size={20} /></div>
        <form onSubmit={saveOptions}>
          <div className="settings-grid">
            <label className="setting-row"><span><strong>Invoice on confirmation</strong><small>Create an invoice when an order is confirmed.</small></span><input type="checkbox" checked={options.auto_invoice_on_confirm === true || options.auto_invoice_on_confirm === 'true'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, auto_invoice_on_confirm: e.target.checked })} /></label>
            <label className="setting-row"><span><strong>Mark overdue invoices</strong><small>Enable the existing overdue-invoice automation.</small></span><input type="checkbox" checked={options.auto_mark_overdue === true || options.auto_mark_overdue === 'true'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, auto_mark_overdue: e.target.checked })} /></label>
            <label className="field"><span>Store domain</span><input value={options.store_channel || ''} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, store_channel: e.target.value })} /></label>
            <label className="field"><span>Base currency</span><select value={options.store_currency || 'INR'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, store_currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AFN</option></select></label>
            <label className="field"><span>Cancellation lock</span><input value="After dispatch (REIHH policy)" readOnly /></label>
          </div>
          {isAdmin && <button className="primary-btn" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save options'}</button>}
        </form>
      </section>

      <section className="panel integration-panel">
        <div className="panel-heading"><div><p className="eyebrow">Connections</p><h2>Outbound webhooks</h2></div><Webhook size={20} /></div>
        {data.webhooks?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Endpoint</th><th>Events</th><th>Status</th></tr></thead><tbody>{data.webhooks.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.url || 'Event log only'}</td><td>{item.events}</td><td>{item.last_status || (item.enabled ? 'Enabled' : 'Disabled')}</td></tr>)}</tbody></table></div> : <p className="muted">No webhook endpoints configured.</p>}
        {isAdmin && <form className="integration-form" onSubmit={addWebhook}>
          <label className="field"><span>Name</span><input required value={webhook.name} onChange={(e) => setWebhook({ ...webhook, name: e.target.value })} /></label>
          <label className="field"><span>Endpoint URL</span><input type="url" required value={webhook.url} onChange={(e) => setWebhook({ ...webhook, url: e.target.value })} /></label>
          <label className="field"><span>Signing secret</span><input type="password" autoComplete="new-password" value={webhook.secret} onChange={(e) => setWebhook({ ...webhook, secret: e.target.value })} /></label>
          <label className="field"><span>Subscribed events</span><input value={webhook.events} onChange={(e) => setWebhook({ ...webhook, events: e.target.value })} /></label>
          <button className="outline-btn"><Plus size={16} /> Add endpoint</button>
        </form>}
      </section>

      <section className="panel integration-panel">
        <div className="panel-heading"><div><p className="eyebrow">Promotions</p><h2>Discount codes</h2></div><Store size={20} /></div>
        {data.discounts?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Discount</th><th>Usage</th><th>Status</th></tr></thead><tbody>{data.discounts.map((item) => <tr key={item.id}><td><strong>{item.code}</strong></td><td>{item.discount_type === 'percent' ? `${item.value}%` : money(item.value)}</td><td>{item.times_used}{item.usage_limit ? ` / ${item.usage_limit}` : ''}</td><td>{item.active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div> : <p className="muted">No discount codes configured.</p>}
        {isAdmin && <form className="integration-form" onSubmit={addDiscount}>
          <label className="field"><span>Code</span><input required value={discount.code} onChange={(e) => setDiscount({ ...discount, code: e.target.value.toUpperCase() })} /></label>
          <label className="field"><span>Type</span><select value={discount.discount_type} onChange={(e) => setDiscount({ ...discount, discount_type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></label>
          <label className="field"><span>Value</span><input type="number" min="0.01" step="0.01" required value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} /></label>
          <label className="field"><span>Description</span><input value={discount.description} onChange={(e) => setDiscount({ ...discount, description: e.target.value })} /></label>
          <button className="outline-btn"><Plus size={16} /> Add discount</button>
        </form>}
      </section>

      <section className="panel integration-panel">
        <div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Recent events</h2></div><Activity size={20} /></div>
        {data.events?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Event</th><th>Record</th><th>Record ID</th><th>Time</th></tr></thead><tbody>{data.events.map((item) => <tr key={item.id}><td>{item.event_type}</td><td>{item.entity_type}</td><td>{item.entity_id ?? '—'}</td><td>{formatDate(item.created_at)}</td></tr>)}</tbody></table></div> : <p className="muted">No integration events recorded yet.</p>}
      </section>
    </>
  );
}