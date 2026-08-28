import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const blank = { name: '', sku: '', price: '', cost_price: '', stock_qty: 0, min_stock_level: 10, category_id: '', description: '' };

export default function Products() {
  const { can } = useAuth();
  const canEdit = can(['admin', 'manager']);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  const load = () => {
    client.get('/products', { params: { search: search || undefined, category_id: categoryId || undefined } })
      .then((res) => setProducts(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    client.get('/products/categories').then((res) => setCategories(res.data || []));
  }, []);

  useEffect(() => { load(); }, [search, categoryId]);

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        cost_price: Number(form.cost_price),
        stock_qty: Number(form.stock_qty),
        min_stock_level: Number(form.min_stock_level),
        category_id: form.category_id ? Number(form.category_id) : null,
      };
      if (form.id) await client.put(`/products/${form.id}`, payload);
      else await client.post('/products', payload);
      setModal(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save product'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Catalog" title="Products" subtitle="Selling price, cost, category and stock levels.">
        {canEdit && <button className="primary-btn heading-btn" onClick={() => { setForm(blank); setModal(true); }}>Add product</button>}
      </PageHeader>
      <div className="toolbar">
        <input className="filter-input" placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {products.length ? (
        <section className="panel table-panel">
          <table className="data-table">
            <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th /></tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong></td>
                  <td>{product.sku}</td>
                  <td>{product.category?.name || '—'}</td>
                  <td>{money(product.price)}</td>
                  <td>{product.stock_qty}{product.is_low_stock ? ' · low' : ''}</td>
                  <td>{canEdit && <button className="text-btn" onClick={() => { setForm({ ...product, category_id: product.category_id || '' }); setModal(true); }}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : <EmptyState icon={Package} text="No products recorded yet." />}

      {modal && (
        <Modal title={form.id ? 'Edit product' : 'Add product'} onClose={() => setModal(false)}>
          <form className="stack-form" onSubmit={save}>
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
            <label>Category
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">None</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Selling price<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
            <label>Cost price<input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} required /></label>
            <label>Stock<input type="number" min="0" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} /></label>
            <label>Minimum stock<input type="number" min="0" value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })} /></label>
            <button className="primary-btn" type="submit">Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}
