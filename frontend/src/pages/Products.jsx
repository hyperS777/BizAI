import { useEffect, useState, useRef } from 'react';
import { Package, RefreshCw, Upload, Download, Trash2, Plus, Layers, Image as ImageIcon, Check, X } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const blank = {
  name: '',
  sku: '',
  price: '',
  cost_price: '',
  compare_at_price: '',
  stock_qty: 0,
  min_stock_level: 10,
  category_id: '',
  description: '',
  vendor: 'Reihh',
  product_type: 'Apparel',
  tags: '',
  image_url: '',
  gallery_urls: '',
  variants: [],
};

export default function Products() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can(['admin', 'manager']);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modal, setModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const load = () => {
    client.get('/products', { params: { search: search || undefined, category_id: categoryId || undefined } })
      .then((res) => setProducts(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    client.get('/products/categories').then((res) => setCategories(res.data || []));
  }, []);

  useEffect(() => { load(); }, [search, categoryId]);

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

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setForm((prev) => ({ ...prev, image_url: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const addVariantRow = () => {
    const baseSku = form.sku || 'SKU';
    const index = (form.variants || []).length + 1;
    const newVariant = {
      sku: `${baseSku}-${index}`,
      option1: 'Vintage Wash',
      option2: 'M',
      price: Number(form.price) || 0,
      cost_price: Number(form.cost_price) || 0,
      stock_qty: 10,
      min_stock_level: 2,
    };
    setForm((prev) => ({ ...prev, variants: [...(prev.variants || []), newVariant] }));
  };

  const generateStandardSizes = () => {
    const baseSku = form.sku || 'REIHH';
    const color = form.option1_name || 'Indigo';
    const newVariants = STANDARD_SIZES.map((sz) => ({
      sku: `${baseSku}-${sz}`,
      option1: color,
      option2: sz,
      price: Number(form.price) || 0,
      cost_price: Number(form.cost_price) || 0,
      stock_qty: 12,
      min_stock_level: 3,
    }));
    setForm((prev) => ({ ...prev, variants: newVariants }));
  };

  const updateVariant = (index, field, value) => {
    setForm((prev) => {
      const copy = [...(prev.variants || [])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, variants: copy };
    });
  };

  const removeVariant = (index) => {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        cost_price: Number(form.cost_price),
        compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        stock_qty: Number(form.stock_qty),
        min_stock_level: Number(form.min_stock_level),
        category_id: form.category_id ? Number(form.category_id) : null,
        variants: (form.variants || []).map((v) => ({
          ...v,
          price: Number(v.price),
          cost_price: Number(v.cost_price),
          stock_qty: Number(v.stock_qty),
          min_stock_level: Number(v.min_stock_level),
        })),
      };
      if (form.id) {
        await client.put(`/products/${form.id}`, payload);
        toast?.success(`Updated "${payload.name}"`);
      } else {
        await client.post('/products', payload);
        toast?.success(`Created garment "${payload.name}"`);
      }
      setModal(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save product'));
      toast?.error(apiError(err, 'Could not save product'));
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Are you sure you want to remove or archive "${product.name}"?`)) return;
    try {
      await client.delete(`/products/${product.id}`);
      setNotice(`Product "${product.name}" archived.`);
      toast?.info(`Archived "${product.name}"`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not delete product'));
      toast?.error('Could not archive product');
    }
  };

  const exportCsv = () => {
    window.open(`${client.defaults.baseURL}/products/export`, '_blank');
    toast?.success('Exporting catalog CSV…');
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await client.post('/products/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const msg = `Imported ${res.data.created_or_updated} products from CSV!`;
      setNotice(msg);
      toast?.success(msg);
      setImportModal(false);
      setImportFile(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to import CSV'));
      toast?.error(apiError(err, 'Failed to import CSV'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Catalog" title="Products" subtitle="Garment pricing, MRP compare-at values, high-res media, size/color variants and stock.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="outline-btn heading-btn" onClick={exportCsv} title="Download CSV inventory catalog">
            <Download size={14} /> Export CSV
          </button>
          {canEdit && (
            <button className="outline-btn heading-btn" onClick={() => setImportModal(true)} title="Bulk upload products from CSV">
              <Upload size={14} /> Import CSV
            </button>
          )}
          {canEdit && (
            <button className="outline-btn heading-btn" disabled={syncing} onClick={syncCatalog} title="Sync live collection feed from reihh.com">
              <RefreshCw size={14} className={syncing ? 'spinner-icon' : ''} />
              {syncing ? 'Syncing REIHH…' : 'Sync REIHH Catalog'}
            </button>
          )}
          {canEdit && (
            <button className="primary-btn heading-btn" onClick={() => { setForm(blank); setModal(true); }}>
              <Plus size={14} /> Add product
            </button>
          )}
        </div>
      </PageHeader>

      {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="toolbar">
        <input className="filter-input" placeholder="Search product name, SKU, or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>

      {products.length ? (
        <section className="panel table-panel product-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price &amp; MRP</th>
                <th>Stock</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
                const discountPct = hasDiscount ? Math.round(((product.compare_at_price - product.price) / product.compare_at_price) * 100) : 0;
                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {product.image_url ? (
                          <img src={product.image_url} alt="" style={{ width: 40, height: 50, objectFit: 'cover', borderRadius: 6, background: '#eee', flexShrink: 0, border: '1px solid var(--border)' }} />
                        ) : (
                          <div style={{ width: 40, height: 50, borderRadius: 6, background: '#f0f2f1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Package size={18} style={{ color: 'var(--muted)' }} />
                          </div>
                        )}
                        <span>
                          <strong style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{product.name}</strong>
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            {product.variants?.length ? `${product.variants.length} variant${product.variants.length > 1 ? 's' : ''} (Size/Color)` : 'Single standard SKU'}
                            {product.vendor ? ` · ${product.vendor}` : ''}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td><code>{product.sku}</code></td>
                    <td>{product.category?.name || 'Apparel'}</td>
                    <td>
                      <div>
                        <strong>{money(product.price)}</strong>
                        {hasDiscount && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            <span style={{ textDecoration: 'line-through' }}>{money(product.compare_at_price)}</span>
                            <span style={{ color: '#10b981', marginLeft: 4, fontWeight: 600 }}>−{discountPct}%</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <strong>{product.stock_qty}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>Min: {product.min_stock_level}</small>
                    </td>
                    <td>
                      {product.is_low_stock ? (
                        <span className="status-pill overdue">Low stock</span>
                      ) : (
                        <span className="status-pill paid">Healthy</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {canEdit && (
                          <button
                            className="text-btn"
                            onClick={() => {
                              setForm({
                                ...product,
                                category_id: product.category_id || '',
                                variants: product.variants || [],
                                compare_at_price: product.compare_at_price || '',
                                description: product.description || '',
                                gallery_urls: product.gallery_urls || '',
                              });
                              setModal(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canEdit && (
                          <button className="text-btn danger" onClick={() => deleteProduct(product)} title="Archive product">
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
      ) : <EmptyState icon={Package} text="No products found in catalog." />}

      {/* Add / Edit Product Modal */}
      {modal && (
        <Modal title={form.id ? `Edit product · ${form.name}` : 'Add new product'} onClose={() => setModal(false)}>
          <form className="stack-form" onSubmit={save} style={{ maxHeight: '78vh', overflowY: 'auto', paddingRight: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>Product Name*
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Vintage Wash Trench Jacket" required />
              </label>
              <label>Base SKU*
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. REI-JKT-01" required />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>Category
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None / General</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Vendor / Brand
                <input value={form.vendor || ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Reihh Studio" />
              </label>
            </div>

            {/* Pricing Section */}
            <div style={{ background: 'var(--panel-alt, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>Pricing &amp; Margins</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label>Selling Price (₹)*
                  <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                </label>
                <label>Compare-at Price / MRP (₹)
                  <input type="number" min="0" step="0.01" value={form.compare_at_price || ''} onChange={(e) => setForm({ ...form, compare_at_price: e.target.value })} placeholder="Original retail" />
                </label>
                <label>Cost Price / COGS (₹)*
                  <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} required />
                </label>
              </div>
            </div>

            {/* Media Upload & URL Section */}
            <div style={{ background: 'var(--panel-alt, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ImageIcon size={15} /> Media &amp; Product Image
              </h4>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {form.image_url ? (
                  <div style={{ position: 'relative' }}>
                    <img src={form.image_url} alt="Preview" style={{ width: 70, height: 85, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, image_url: '' }))}
                      style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                      title="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: 70, height: 85, border: '2px dashed var(--border)', borderRadius: 6, display: 'grid', placeItems: 'center', cursor: 'pointer', background: '#fff' }}
                    title="Click to upload"
                  >
                    <Upload size={18} style={{ color: 'var(--muted)' }} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleImageFileChange}
                  />
                  <button type="button" className="outline-btn" style={{ marginBottom: 6 }} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} /> Upload image file
                  </button>
                  <label style={{ fontSize: 11, margin: 0 }}>Or paste Image URL:
                    <input
                      type="url"
                      value={form.image_url || ''}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      placeholder="https://cdn.shopify.com/.../garment.jpg"
                      style={{ marginTop: 2 }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Description */}
            <label>Product Description
              <textarea
                rows={3}
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Fabric composition, fit notes, silhouette details, care instructions…"
              />
            </label>

            {/* Inventory Thresholds */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>Total Available Stock
                <input type="number" min="0" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
              </label>
              <label>Low Stock Warning Threshold
                <input type="number" min="0" value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })} />
              </label>
            </div>

            {/* Garment Variants Section */}
            <div style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={15} /> Size &amp; Color Variants
                  </h4>
                  <small style={{ color: 'var(--muted)', fontSize: 11 }}>Manage SKU-level inventory for XS, S, M, L, XL etc.</small>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="text-btn" onClick={generateStandardSizes} title="Generate XS to XXL rows automatically">
                    + Generate Standard Sizes
                  </button>
                  <button type="button" className="outline-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={addVariantRow}>
                    + Add Variant Row
                  </button>
                </div>
              </div>

              {form.variants?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {form.variants.map((v, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr 28px', gap: 6, alignItems: 'center', background: '#fff', padding: '6px 8px', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                      <input
                        placeholder="Variant SKU"
                        value={v.sku}
                        onChange={(e) => updateVariant(idx, 'sku', e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      />
                      <input
                        placeholder="Color (Option 1)"
                        value={v.option1 || ''}
                        onChange={(e) => updateVariant(idx, 'option1', e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      />
                      <input
                        placeholder="Size (Option 2)"
                        value={v.option2 || ''}
                        onChange={(e) => updateVariant(idx, 'option2', e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        value={v.price}
                        onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      />
                      <input
                        type="number"
                        placeholder="Stock"
                        value={v.stock_qty}
                        onChange={(e) => updateVariant(idx, 'stock_qty', e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                        title="Remove variant"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: '6px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
                  Single SKU item. Click "+ Generate Standard Sizes" to create garment size variants.
                </p>
              )}
            </div>

            <button className="primary-btn" type="submit" style={{ marginTop: 8 }}>
              {form.id ? 'Update Product' : 'Save Product to Catalog'}
            </button>
          </form>
        </Modal>
      )}

      {/* CSV Import Modal */}
      {importModal && (
        <Modal title="Bulk Import Products (CSV)" onClose={() => setImportModal(false)}>
          <form className="stack-form" onSubmit={handleImportSubmit}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              Upload a standard CSV file with headers: <code>Name, SKU, Price, CostPrice, Stock, MinStock, Category, Vendor, Description</code>.
            </p>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', background: '#fafafa' }}>
              <Upload size={28} style={{ color: 'var(--teal)', margin: '0 auto 8px' }} />
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                required
              />
              {importFile && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal)' }}>
                  Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
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
