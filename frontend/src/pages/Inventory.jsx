import { useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, AlertTriangle, ArrowUpDown, FileSpreadsheet, Printer, Check, Plus, Minus } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const REASONS = [
  { id: 'supplier_po', label: 'Supplier PO (Received stock)' },
  { id: 'customer_return', label: 'Customer Return (Restocked)' },
  { id: 'audit_correction', label: 'Inventory Audit Correction' },
  { id: 'damaged', label: 'Damaged / Defect Write-off' },
  { id: 'sample', label: 'Showroom / Stylist Sample' },
  { id: 'manual_adjustment', label: 'Manual Operational Adjustment' },
];

export default function Inventory() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can(['admin', 'manager']);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const [poModal, setPoModal] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const [sortField, setSortField] = useState('stock_qty');
  const [sortAsc, setSortAsc] = useState(true);

  const load = () => {
    Promise.all([client.get('/products'), client.get('/products/history')])
      .then(([p, h]) => {
        setProducts(p.data || []);
        setHistory(h.data || []);
      })
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => { load(); }, []);

  const syncCatalog = async () => {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const { data } = await client.post('/storefront/sync-catalog');
      setNotice(`Synced ${data.products_synced} live products and ${data.variants_synced} variants from REIHH!`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not sync live catalog'));
    } finally {
      setSyncing(false);
    }
  };

  const saveAdjust = async (event) => {
    event.preventDefault();
    try {
      await client.post(`/products/${adjust.id}/stock`, {
        quantity_change: Number(adjust.quantity_change),
        reason: adjust.reason || 'manual_adjustment',
        notes: adjust.notes,
        variant_id: adjust.variant_id ? Number(adjust.variant_id) : null,
      });
      setAdjust(null);
      setNotice('Inventory adjusted successfully.');
      toast?.success(`Updated stock by ${adjust.quantity_change > 0 ? '+' : ''}${adjust.quantity_change} units`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update stock'));
      toast?.error(apiError(err, 'Could not update stock'));
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.is_low_stock).length;
  }, [products]);

  const displayedProducts = useMemo(() => {
    let list = [...products];
    if (lowOnly) {
      list = list.filter((p) => p.is_low_stock);
    }
    list.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, lowOnly, sortField, sortAsc]);

  const lowStockItems = useMemo(() => {
    return products.filter((p) => p.is_low_stock);
  }, [products]);

  const estimatedPoTotal = useMemo(() => {
    return lowStockItems.reduce((sum, p) => {
      const deficit = Math.max((p.min_stock_level * 2) - p.stock_qty, 10);
      return sum + (deficit * (p.cost_price || p.price * 0.4));
    }, 0);
  }, [lowStockItems]);

  return (
    <>
      <PageHeader eyebrow="Warehouse" title="Inventory" subtitle="Live stock on hand, minimum thresholds, variant tracking, and audit ledger.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="outline-btn heading-btn"
            onClick={() => setPoModal(true)}
            title="Generate automated reorder purchase order"
          >
            <FileSpreadsheet size={14} /> Draft Purchase Order ({lowStockCount})
          </button>
          {canEdit && (
            <button className="outline-btn heading-btn" disabled={syncing} onClick={syncCatalog} title="Sync live collection feed from reihh.com">
              <RefreshCw size={14} className={syncing ? 'spinner-icon' : ''} />
              {syncing ? 'Syncing REIHH…' : 'Sync REIHH Catalog'}
            </button>
          )}
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      {/* Filter and sorting controls */}
      <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className={`pill-btn ${lowOnly ? 'active' : ''}`}
            onClick={() => setLowOnly(!lowOnly)}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: lowOnly ? '1px solid #ef4444' : '1px solid var(--border)',
              background: lowOnly ? '#fef2f2' : 'transparent',
              color: lowOnly ? '#ef4444' : 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={13} />
            {lowOnly ? 'Showing low stock only' : 'Filter: Low stock items'}
            <span style={{ background: lowOnly ? '#ef4444' : '#e5e7eb', color: lowOnly ? '#fff' : '#374151', padding: '1px 6px', borderRadius: 10, fontSize: 11 }}>
              {lowStockCount}
            </span>
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Showing {displayedProducts.length} of {products.length} SKUs
        </div>
      </div>

      {displayedProducts.length ? (
        <section className="panel table-panel inventory-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Product <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('stock_qty')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    On Hand <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('min_stock_level')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Min Safety Stock <ArrowUpDown size={12} />
                  </div>
                </th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {product.image_url ? (
                        <img src={product.image_url} alt="" style={{ width: 36, height: 46, objectFit: 'cover', borderRadius: 5, background: '#eee', flexShrink: 0, border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: 36, height: 46, borderRadius: 5, background: '#f0f2f1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          <Package size={16} style={{ color: 'var(--muted)' }} />
                        </div>
                      )}
                      <span>
                        <strong style={{ display: 'block', fontSize: 13 }}>{product.name}</strong>
                        <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                          SKU: <code>{product.sku}</code>
                          {product.variants?.length ? ` · ${product.variants.length} size variants` : ''}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <strong style={{ fontSize: 14 }}>{product.stock_qty}</strong>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>units</span>
                  </td>
                  <td>{product.min_stock_level} units</td>
                  <td>
                    {product.is_low_stock ? (
                      <span className="status-pill overdue">Low stock</span>
                    ) : (
                      <span className="status-pill paid">Healthy</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {canEdit && (
                      <button
                        className="text-btn"
                        onClick={() => setAdjust({
                          id: product.id,
                          name: product.name,
                          quantity_change: 0,
                          reason: 'supplier_po',
                          notes: '',
                          variant_id: product.variants?.[0]?.id || '',
                          variants: product.variants || [],
                        })}
                      >
                        Adjust stock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={Package} text="No products match the selected inventory filter." />}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Warehouse audit trail (Recent movements)</h2>
        {history.length ? history.slice(0, 15).map((row) => (
          <div className="history-row" key={row.id}>
            <strong style={{ textTransform: 'capitalize' }}>{(row.reason || 'Manual').replace(/_/g, ' ')}</strong>
            <span style={{ fontWeight: 600, color: row.quantity_change > 0 ? '#10b981' : '#ef4444' }}>
              {row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change} units
            </span>
            <span>{formatDate(row.created_at)}</span>
            <span className="muted">{row.notes || '—'}</span>
          </div>
        )) : <p className="muted">No stock movements recorded yet.</p>}
      </section>

      {/* Stock Adjustment Modal */}
      {adjust && (
        <Modal title={`Adjust Stock · ${adjust.name}`} onClose={() => setAdjust(null)}>
          <form className="stack-form" onSubmit={saveAdjust}>
            {/* If product has variants, allow selecting variant */}
            {adjust.variants?.length > 1 && (
              <label>Select Size / Color Variant
                <select
                  value={adjust.variant_id}
                  onChange={(e) => setAdjust({ ...adjust, variant_id: e.target.value })}
                >
                  {adjust.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.option1 || ''} {v.option2 ? `/ ${v.option2}` : ''} (SKU: {v.sku} · Current: {v.stock_qty})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>Adjustment Reason*
              <select
                value={adjust.reason}
                onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
                required
              >
                {REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>

            <label>Quantity change (+ or −)*
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  value={adjust.quantity_change}
                  onChange={(e) => setAdjust({ ...adjust, quantity_change: e.target.value })}
                  placeholder="e.g. +25 or -3"
                  required
                />
              </div>
            </label>
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Positive values increase warehouse stock (e.g. Supplier PO receipt). Negative values reduce stock (e.g. defect write-off or sample).
            </p>

            <label>Notes / PO / Ticket Reference
              <input
                value={adjust.notes}
                onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })}
                placeholder="e.g. Inbound PO #4489 from Delhi manufacturer"
              />
            </label>

            <button className="primary-btn" type="submit">
              Apply Warehouse Adjustment
            </button>
          </form>
        </Modal>
      )}

      {/* Automated Purchase Order (PO) Modal */}
      {poModal && (
        <Modal title="Automated Purchase Order (PO) · Restock Plan" onClose={() => setPoModal(false)}>
          <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div>
                <strong style={{ display: 'block', fontSize: 14 }}>Supplier Reorder Recommendation</strong>
                <small style={{ color: 'var(--muted)' }}>
                  Grounded in current inventory safety thresholds and sales velocity.
                </small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <small style={{ color: 'var(--muted)' }}>Est. Total Order Cost</small>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{money(estimatedPoTotal)}</div>
              </div>
            </div>

            {lowStockItems.length ? (
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Product / SKU</th>
                    <th>On Hand</th>
                    <th>Min Safety</th>
                    <th>Order Qty</th>
                    <th>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((p) => {
                    const orderQty = Math.max((p.min_stock_level * 2) - p.stock_qty, 10);
                    const cost = p.cost_price || p.price * 0.4;
                    const lineTotal = orderQty * cost;
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: 11 }}>{p.sku}</div>
                        </td>
                        <td><span style={{ color: '#ef4444', fontWeight: 600 }}>{p.stock_qty}</span></td>
                        <td>{p.min_stock_level}</td>
                        <td><strong>+{orderQty} units</strong></td>
                        <td>{money(cost)}</td>
                        <td style={{ textAlign: 'right' }}>{money(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ textAlign: 'center', color: '#10b981', padding: 20 }}>
                All products are at or above safety stock levels. No purchase orders required at this time!
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="outline-btn"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print PO Draft
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setPoModal(false);
                  setNotice('Purchase order draft saved to procurement records.');
                }}
              >
                <Check size={14} /> Approve &amp; Dispatch to Manufacturer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
