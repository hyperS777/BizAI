import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
  const { can } = useAuth();
  const canEdit = can(['admin', 'manager']);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [adjust, setAdjust] = useState(null);

  const load = () => {
    Promise.all([client.get('/products'), client.get('/products/history')])
      .then(([p, h]) => {
        setProducts(p.data || []);
        setHistory(h.data || []);
      })
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => { load(); }, []);

  const saveAdjust = async (event) => {
    event.preventDefault();
    try {
      await client.post(`/products/${adjust.id}/stock`, {
        quantity_change: Number(adjust.quantity_change),
        reason: 'manual_adjustment',
        notes: adjust.notes,
      });
      setAdjust(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update stock'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Warehouse" title="Inventory" subtitle="Stock on hand, minimum levels, and movement history." />
      {error && <div className="notice error">{error}</div>}
      {products.length ? (
        <section className="panel table-panel inventory-table-panel">
          <table className="data-table">
            <thead><tr><th>Product</th><th>On hand</th><th>Minimum</th><th>Status</th><th /></tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong><div className="muted">{product.sku}</div></td>
                  <td>{product.stock_qty}</td>
                  <td>{product.min_stock_level}</td>
                  <td>{product.is_low_stock ? <span className="status-pill overdue">Low stock</span> : <span className="status-pill paid">Healthy</span>}</td>
                  <td>{canEdit && <button className="text-btn" onClick={() => setAdjust({ id: product.id, name: product.name, quantity_change: 0, notes: '' })}>Adjust</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={Package} text="No inventory yet." />}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent movements</h2>
        {history.length ? history.slice(0, 12).map((row) => (
          <div className="history-row" key={row.id}>
            <strong>{row.reason}</strong>
            <span>{row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change}</span>
            <span>{formatDate(row.created_at)}</span>
            <span className="muted">{row.notes || ''}</span>
          </div>
        )) : <p className="muted">No stock movements recorded yet.</p>}
      </section>

      {adjust && (
        <Modal title={`Adjust stock · ${adjust.name}`} onClose={() => setAdjust(null)}>
          <form className="stack-form" onSubmit={saveAdjust}>
            <label>Quantity change
              <input type="number" value={adjust.quantity_change} onChange={(e) => setAdjust({ ...adjust, quantity_change: e.target.value })} required />
            </label>
            <p className="muted">Use a negative number to reduce stock.</p>
            <label>Notes<input value={adjust.notes} onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })} /></label>
            <button className="primary-btn" type="submit">Apply</button>
          </form>
        </Modal>
      )}
    </>
  );
}
