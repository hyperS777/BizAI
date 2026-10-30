import { useEffect, useState } from 'react';
import {
  Activity, BarChart3, Check, ChevronDown, ChevronRight, CircleAlert,
  Download, Eye, Package, PlugZap, Plus, Save, ShoppingCart, Store,
  TrendingUp, Users, Webhook,
} from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const initialWebhook = {
  name: '', url: '', secret: '',
  events: 'order.created,order.confirmed,order.cancelled,invoice.created,invoice.paid,inventory.low_stock',
  enabled: true,
};
const initialDiscount = { code: '', discount_type: 'percent', value: '', description: '' };

/* ── Funnel bar component ── */
function FunnelBar({ stage, count, pct, prevPct, color = '#203a2b' }) {
  return (
    <div className="funnel-row">
      <span className="funnel-label">{stage}</span>
      <div className="funnel-bar-track">
        <div
          className="funnel-bar-fill"
          style={{ width: `${pct}%`, background: color }}
          title={`${count} · ${pct}%`}
        />
      </div>
      <span className="funnel-count">{count.toLocaleString('en-IN')}</span>
      <span className="funnel-pct" style={{ color: pct > 50 ? '#2d6e43' : pct > 20 ? '#7a5e20' : '#8a3d2c' }}>
        {pct}%
      </span>
    </div>
  );
}

/* ── Export to CSV ── */
function exportCSV(simulations) {
  const headers = ['Reference', 'Customer', 'Email', 'Items', 'Total', 'Status', 'Created'];
  const rows = simulations.map((s) => [
    s.reference, s.customer_name, s.customer_email,
    (s.items || []).length, s.total_amount, s.delivery_status, formatDate(s.created_at),
  ]);
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reihh-demo-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── KPI card ── */
function KpiCard({ label, value, sub, color }) {
  return (
    <article className={`metric ${color}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </article>
  );
}

export default function Integrations() {
  const { can } = useAuth();
  const isAdmin = can(['admin']);

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState('analytics'); // analytics | orders | settings | discounts

  /* ── Integration data ── */
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({});
  const [webhook, setWebhook] = useState(initialWebhook);
  const [discount, setDiscount] = useState(initialDiscount);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /* ── Analytics ── */
  const [analytics, setAnalytics] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  /* ── Demo orders ── */
  const [simulations, setSimulations] = useState(null);
  const [simsLoading, setSimsLoading] = useState(false);
  const [expandedSim, setExpandedSim] = useState(null);

  const load = () => {
    return client.get('/integrations/dashboard').then((res) => {
      setData(res.data);
      setOptions(res.data.settings || {});
    }).catch((err) => setError(apiError(err, 'Could not load integration settings')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    client.get(`/storefront/analytics?days=${analyticsDays}`)
      .then(({ data: result }) => setAnalytics(result))
      .catch(() => setAnalytics(null));
    client.get(`/storefront/analytics/funnel?days=${analyticsDays}`)
      .then(({ data: result }) => setFunnel(result))
      .catch(() => setFunnel(null));
  }, [analyticsDays]);

  useEffect(() => {
    if (activeTab === 'orders' && !simulations) {
      setSimsLoading(true);
      client.get('/storefront/simulations?limit=100')
        .then(({ data: result }) => setSimulations(result))
        .catch(() => setSimulations([]))
        .finally(() => setSimsLoading(false));
    }
  }, [activeTab]);

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

  /* ── Computed KPIs ── */
  const kpis = (() => {
    if (!simulations || simulations.length === 0) return null;
    const totalRevenue = simulations.reduce((s, sim) => s + (sim.total_amount || 0), 0);
    const uniqueEmails = new Set(simulations.map((s) => s.customer_email)).size;
    const avgOrder = simulations.length ? Math.round(totalRevenue / simulations.length) : 0;
    const totalSessions = analytics?.totals?.unique_sessions || 1;
    const purchases = (analytics?.totals?.demo_purchase || 0) + (analytics?.totals?.purchase || 0);
    const convRate = totalSessions ? ((purchases / totalSessions) * 100).toFixed(1) : '0';
    return { totalRevenue, uniqueEmails, avgOrder, convRate };
  })();

  if (loading && !data) return <div className="loading">Loading integration settings…</div>;
  if (!data) return (
    <>
      <PageHeader eyebrow="Commerce operations" title="Integrations" subtitle="Store connection, automation rules, webhooks and discounts." />
      <div className="notice error">{error || 'Could not load integration settings.'}</div>
      <button className="outline-btn" onClick={load}>Retry connection</button>
    </>
  );

  const tabs = [
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'orders', label: 'Demo orders', icon: ShoppingCart },
    { id: 'settings', label: 'Settings & Webhooks', icon: PlugZap },
    { id: 'discounts', label: 'Discounts', icon: Store },
  ];

  return (
    <>
      <PageHeader eyebrow="Commerce operations" title="Integrations" subtitle="Store connection, automation rules, webhooks and discounts.">
        {isAdmin && data.store?.configured && (
          <button className="primary-btn" onClick={syncCatalog} disabled={syncBusy}>
            <PlugZap size={16} /> {syncBusy ? 'Syncing store…' : 'Sync store now'}
          </button>
        )}
      </PageHeader>

      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice success"><Check size={16} /> {notice}</div>}

      {/* ── Status KPIs ── */}
      <section className="metric-grid integration-status-grid">
        <article className="metric teal"><span>Store</span><strong>{data.store?.domain || data.store?.channel || 'REIHH'}</strong><small>{data.store?.configured ? 'Connected' : 'Connection not configured'}</small></article>
        <article className="metric blue"><span>Base currency</span><strong>{data.store?.currency || 'INR'}</strong><small>Storefront checkout remains on Shopify</small></article>
        <article className="metric yellow"><span>Webhook endpoints</span><strong>{data.webhooks?.filter((item) => item.enabled).length || 0}</strong><small>Enabled endpoints</small></article>
        <article className="metric coral"><span>Recent events</span><strong>{data.events?.length || 0}</strong><small>Latest integration activity</small></article>
      </section>

      {!data.store?.configured && (
        <div className="notice"><CircleAlert size={16} /> Live Shopify sync is not configured. The store must authorize API access and provide verified webhook credentials before real orders or inventory can sync.</div>
      )}
      {data.store?.configured && !data.store?.invoice_links_ready && (
        <div className="notice"><CircleAlert size={16} /> Add <code>PUBLIC_API_BASE_URL</code> on the API host to publish customer invoice links to Shopify orders.</div>
      )}

      {/* ── Store Demo Tabs ── */}
      <section className="panel integration-panel store-demo-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Store demo</p><h2>REIHH storefront analytics</h2></div>
          <TrendingUp size={20} />
        </div>

        {/* Tab nav */}
        <div className="store-demo-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`store-demo-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── Analytics tab ── */}
        {activeTab === 'analytics' && (
          <div className="store-demo-tab-content">
            <div className="analytics-toolbar">
              <span className="muted">Live events and test simulations reported separately.</span>
              <select
                aria-label="Analytics date range"
                value={analyticsDays}
                onChange={(e) => setAnalyticsDays(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>

            {/* Funnel */}
            {funnel ? (
              <div className="funnel-container">
                <h3 className="funnel-title">Conversion funnel</h3>
                {funnel.funnel.map((row, i) => (
                  <FunnelBar
                    key={row.stage}
                    stage={row.stage}
                    count={row.count}
                    pct={row.pct}
                    color={i === 0 ? '#203a2b' : i === 1 ? '#2d6e43' : i === 2 ? '#4a8a5e' : i === 3 ? '#6ba77b' : '#9bccaa'}
                  />
                ))}
              </div>
            ) : analytics ? null : (
              <p className="muted">Funnel data unavailable — analytics endpoint may not exist yet.</p>
            )}

            {/* Classic KPI cards */}
            {analytics ? (
              <>
                <div className="metric-grid funnel-metrics">
                  <article className="metric teal">
                    <span><Eye size={14} /> Product views</span>
                    <strong>{analytics.totals?.product_view || 0}</strong>
                    <small>{analytics.products?.reduce((sum, item) => sum + item.unique_viewers, 0) || 0} product viewers</small>
                  </article>
                  <article className="metric blue">
                    <span><Users size={14} /> Add-to-bag</span>
                    <strong>{analytics.totals?.add_to_cart || 0}</strong>
                    <small>{analytics.products?.reduce((sum, item) => sum + item.unique_live_cart_sessions, 0) || 0} live customer sessions</small>
                  </article>
                  <article className="metric yellow">
                    <span><ShoppingCart size={14} /> Checkout starts</span>
                    <strong>{analytics.totals?.checkout_started || 0}</strong>
                    <small>{analytics.totals?.demo_checkout_started || 0} demo checkouts</small>
                  </article>
                  <article className="metric coral">
                    <span><Check size={14} /> Shopify orders</span>
                    <strong>{analytics.products?.reduce((sum, item) => sum + item.unique_purchase_sessions, 0) || 0}</strong>
                    <small>{analytics.totals?.purchase || 0} units · {analytics.totals?.demo_purchase || 0} demo excluded</small>
                  </article>
                </div>

                {/* Product heatmap table */}
                {analytics.products?.length ? (
                  <div className="table-wrap product-heatmap-table">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Views</th>
                          <th>Carts</th>
                          <th>Purchases</th>
                          <th>Demo units</th>
                          <th>View→cart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.products.slice(0, 8).map((item) => (
                          <tr key={item.product_id}>
                            <td><strong style={{ fontSize: 11 }}>{item.product_title}</strong></td>
                            <td>
                              <div className="inline-bar-wrap">
                                <div className="inline-bar" style={{ width: `${Math.min((item.views / (analytics.products[0]?.views || 1)) * 100, 100)}%`, background: '#203a2b' }} />
                                <span>{item.views}</span>
                              </div>
                            </td>
                            <td>
                              <div className="inline-bar-wrap">
                                <div className="inline-bar" style={{ width: `${Math.min((item.add_to_cart / (analytics.products[0]?.views || 1)) * 100, 100)}%`, background: '#4a8a5e' }} />
                                <span>{item.add_to_cart}</span>
                              </div>
                            </td>
                            <td>{item.unique_purchase_sessions}</td>
                            <td>{item.demo_purchases}</td>
                            <td>{item.view_to_cart_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No storefront events in this range yet. Browse the customer store to start the funnel.</p>
                )}
              </>
            ) : (
              <p className="muted">Storefront analytics are unavailable.</p>
            )}
          </div>
        )}

        {/* ── Demo orders tab ── */}
        {activeTab === 'orders' && (
          <div className="store-demo-tab-content">
            {/* KPI cards from simulations */}
            {kpis && (
              <div className="metric-grid funnel-metrics">
                <KpiCard label="Total revenue" value={money(kpis.totalRevenue)} sub="All demo simulations" color="teal" />
                <KpiCard label="Unique customers" value={kpis.uniqueEmails.toLocaleString()} sub="By email address" color="blue" />
                <KpiCard label="Avg order value" value={money(kpis.avgOrder)} sub="Per simulation" color="yellow" />
                <KpiCard label="Conversion rate" value={`${kpis.convRate}%`} sub="Purchases / sessions" color="coral" />
              </div>
            )}

            <div className="orders-toolbar">
              <span className="muted">{simulations ? `${simulations.length} simulation${simulations.length !== 1 ? 's' : ''}` : ''}</span>
              {simulations?.length > 0 && (
                <button className="outline-btn" onClick={() => exportCSV(simulations)}>
                  <Download size={15} /> Export CSV
                </button>
              )}
            </div>

            {simsLoading && <p className="muted">Loading demo orders…</p>}
            {!simsLoading && simulations?.length === 0 && (
              <p className="muted">No demo orders yet. <a href="/store/demo">Place a test order →</a></p>
            )}
            {!simsLoading && simulations?.length > 0 && (
              <div className="table-wrap simulations-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Reference</th>
                      <th>Customer</th>
                      <th>Email</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulations.map((sim) => (
                      <>
                        <tr
                          key={sim.id}
                          className={`sim-row ${expandedSim === sim.id ? 'expanded' : ''}`}
                          onClick={() => setExpandedSim(expandedSim === sim.id ? null : sim.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ width: 24 }}>
                            {expandedSim === sim.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td><strong>{sim.reference}</strong></td>
                          <td>{sim.customer_name}</td>
                          <td>{sim.customer_email}</td>
                          <td>{(sim.items || []).length}</td>
                          <td>{money(sim.total_amount)}</td>
                          <td>
                            <span className={`sim-status-badge sim-status-${sim.delivery_status}`}>
                              {sim.delivery_status?.replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td>{formatDate(sim.created_at)}</td>
                        </tr>
                        {expandedSim === sim.id && (
                          <tr className="sim-expanded-row" key={`${sim.id}-expanded`}>
                            <td colSpan={8}>
                              <div className="sim-expanded-items">
                                {(sim.items || []).map((item) => (
                                  <div className="sim-item" key={item.variant_id}>
                                    {item.image_url && <img src={item.image_url} alt="" />}
                                    <span>
                                      <strong>{item.title}</strong>
                                      <small>{item.variant_title} · Qty {item.quantity}</small>
                                    </span>
                                    <b>{money(item.line_total)}</b>
                                  </div>
                                ))}
                                <div className="sim-delivery-info">
                                  <Package size={13} /> {sim.delivery_address}
                                  {sim.delivery_token && (
                                    <a href={`/delivery/demo/${sim.delivery_token}`} target="_blank" rel="noreferrer" className="sim-delivery-link">
                                      Track delivery →
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Settings tab ── */}
        {activeTab === 'settings' && (
          <div className="store-demo-tab-content">
            {/* Options form */}
            <div className="panel-section">
              <div className="panel-subsection-heading"><PlugZap size={16} /> Automation and store rules</div>
              <form onSubmit={saveOptions}>
                <div className="settings-grid">
                  <label className="setting-row">
                    <span><strong>Invoice on confirmation</strong><small>Create an invoice when an order is confirmed.</small></span>
                    <input type="checkbox" checked={options.auto_invoice_on_confirm === true || options.auto_invoice_on_confirm === 'true'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, auto_invoice_on_confirm: e.target.checked })} />
                  </label>
                  <label className="setting-row">
                    <span><strong>Mark overdue invoices</strong><small>Enable the existing overdue-invoice automation.</small></span>
                    <input type="checkbox" checked={options.auto_mark_overdue === true || options.auto_mark_overdue === 'true'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, auto_mark_overdue: e.target.checked })} />
                  </label>
                  <label className="field"><span>Store domain</span><input value={options.store_channel || ''} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, store_channel: e.target.value })} /></label>
                  <label className="field"><span>Base currency</span><select value={options.store_currency || 'INR'} disabled={!isAdmin} onChange={(e) => setOptions({ ...options, store_currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AFN</option></select></label>
                  <label className="field"><span>Cancellation lock</span><input value="After dispatch (REIHH policy)" readOnly /></label>
                </div>
                {isAdmin && <button className="primary-btn" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save options'}</button>}
              </form>
            </div>

            {/* Webhooks */}
            <div className="panel-section">
              <div className="panel-subsection-heading"><Webhook size={16} /> Outbound webhooks</div>
              {data.webhooks?.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Endpoint</th><th>Events</th><th>Status</th></tr></thead>
                    <tbody>{data.webhooks.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.url || 'Event log only'}</td><td>{item.events}</td><td>{item.last_status || (item.enabled ? 'Enabled' : 'Disabled')}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="muted">No webhook endpoints configured.</p>}
              {isAdmin && (
                <form className="integration-form" onSubmit={addWebhook}>
                  <label className="field"><span>Name</span><input required value={webhook.name} onChange={(e) => setWebhook({ ...webhook, name: e.target.value })} /></label>
                  <label className="field"><span>Endpoint URL</span><input type="url" required value={webhook.url} onChange={(e) => setWebhook({ ...webhook, url: e.target.value })} /></label>
                  <label className="field"><span>Signing secret</span><input type="password" autoComplete="new-password" value={webhook.secret} onChange={(e) => setWebhook({ ...webhook, secret: e.target.value })} /></label>
                  <label className="field"><span>Subscribed events</span><input value={webhook.events} onChange={(e) => setWebhook({ ...webhook, events: e.target.value })} /></label>
                  <button className="outline-btn"><Plus size={16} /> Add endpoint</button>
                </form>
              )}
            </div>

            {/* Audit trail */}
            <div className="panel-section">
              <div className="panel-subsection-heading"><Activity size={16} /> Recent events</div>
              {data.events?.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Event</th><th>Record</th><th>Record ID</th><th>Time</th></tr></thead>
                    <tbody>{data.events.map((item) => <tr key={item.id}><td>{item.event_type}</td><td>{item.entity_type}</td><td>{item.entity_id ?? '—'}</td><td>{formatDate(item.created_at)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="muted">No integration events recorded yet.</p>}
            </div>
          </div>
        )}

        {/* ── Discounts tab ── */}
        {activeTab === 'discounts' && (
          <div className="store-demo-tab-content">
            <div className="panel-section">
              <div className="panel-subsection-heading"><Store size={16} /> Active discount codes</div>
              {data.discounts?.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Code</th><th>Discount</th><th>Usage</th><th>Status</th></tr></thead>
                    <tbody>{data.discounts.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.code}</strong></td>
                        <td>{item.discount_type === 'percent' ? `${item.value}%` : money(item.value)}</td>
                        <td>{item.times_used}{item.usage_limit ? ` / ${item.usage_limit}` : ''}</td>
                        <td><span className={`sim-status-badge ${item.active ? 'sim-status-delivered' : 'sim-status-returned_to_store'}`}>{item.active ? 'Active' : 'Inactive'}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="muted">No discount codes configured.</p>}
              {isAdmin && (
                <form className="integration-form" onSubmit={addDiscount}>
                  <label className="field"><span>Code</span><input required value={discount.code} onChange={(e) => setDiscount({ ...discount, code: e.target.value.toUpperCase() })} /></label>
                  <label className="field"><span>Type</span><select value={discount.discount_type} onChange={(e) => setDiscount({ ...discount, discount_type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></label>
                  <label className="field"><span>Value</span><input type="number" min="0.01" step="0.01" required value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} /></label>
                  <label className="field"><span>Description</span><input value={discount.description} onChange={(e) => setDiscount({ ...discount, description: e.target.value })} /></label>
                  <button className="outline-btn"><Plus size={16} /> Add discount</button>
                </form>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
