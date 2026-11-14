import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Package, ClipboardList, Users, Sparkles, Plus,
  FileBarChart, Warehouse, Moon, Sun, ArrowRight, X, ExternalLink, Receipt
} from 'lucide-react';
import client from '../api/client';
import { money } from '../utils/format';

export default function CommandPalette({ isOpen, onClose, onToggleTheme, dark }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ products: [], orders: [], customers: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search when query changes
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ products: [], orders: [], customers: [] });
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [prodRes, ordRes, custRes] = await Promise.allSettled([
          client.get('/products'),
          client.get('/orders'),
          client.get('/customers'),
        ]);

        const q = trimmed.toLowerCase();

        const prods = prodRes.status === 'fulfilled' && Array.isArray(prodRes.value.data)
          ? prodRes.value.data
              .filter((p) => p.title?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
              .slice(0, 4)
          : [];

        const ords = ordRes.status === 'fulfilled' && Array.isArray(ordRes.value.data)
          ? ordRes.value.data
              .filter((o) => o.order_number?.toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q) || o.status?.toLowerCase().includes(q))
              .slice(0, 4)
          : [];

        const custs = custRes.status === 'fulfilled' && Array.isArray(custRes.value.data)
          ? custRes.value.data
              .filter((c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q))
              .slice(0, 3)
          : [];

        setResults({ products: prods, orders: ords, customers: custs });
      } catch (err) {
        console.error('Command search error:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Navigation shortcuts list when no query
  const quickActions = [
    { label: 'Create New Order', icon: ClipboardList, path: '/orders?action=new', category: 'Action' },
    { label: 'Add New Product', icon: Plus, path: '/products?action=new', category: 'Action' },
    { label: 'Stock PO & Reorders', icon: Warehouse, path: '/inventory', category: 'Navigation' },
    { label: 'Ask BizAI Co-Pilot', icon: Sparkles, path: '/ai', category: 'Intelligence' },
    { label: 'Download P&L Statement', icon: FileBarChart, path: '/reports', category: 'Finance' },
    { label: 'Record Business Expense', icon: Receipt, path: '/expenses', category: 'Finance' },
    { label: 'View Customer Storefront', icon: ExternalLink, path: '/store', category: 'Storefront', external: true },
  ];

  // Flattened active list for keyboard navigation
  const allItems = query.trim()
    ? [
        ...results.products.map((p) => ({ type: 'product', data: p })),
        ...results.orders.map((o) => ({ type: 'order', data: o })),
        ...results.customers.map((c) => ({ type: 'customer', data: c })),
      ]
    : quickActions.map((a) => ({ type: 'action', data: a }));

  const handleSelect = (item) => {
    if (!item) return;
    onClose();
    if (item.type === 'action') {
      if (item.data.external) window.open(item.data.path, '_blank');
      else navigate(item.data.path);
    } else if (item.type === 'product') {
      navigate(`/products?q=${encodeURIComponent(item.data.title)}`);
    } else if (item.type === 'order') {
      navigate(`/orders?q=${encodeURIComponent(item.data.order_number)}`);
    } else if (item.type === 'customer') {
      navigate(`/customers/${item.data.id}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev + 1) % allItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) handleSelect(allItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="command-palette-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="command-palette-header">
          <Search size={18} className="command-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search products, orders, customers, or actions… (Type to search)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="command-clear-btn" onClick={() => setQuery('')} aria-label="Clear">
              <X size={15} />
            </button>
          )}
          <span className="command-kbd-esc">ESC</span>
        </div>

        <div className="command-palette-body">
          {loading && (
            <div className="command-loading-strip">
              <span className="command-spinner" /> Searching live database…
            </div>
          )}

          {!query.trim() && (
            <div className="command-section">
              <div className="command-section-title">Quick Actions & Shortcuts</div>
              <div className="command-items-list">
                {quickActions.map((action, idx) => {
                  const Icon = action.icon;
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={action.label}
                      className={`command-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelect({ type: 'action', data: action })}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="command-item-icon">
                        <Icon size={16} />
                      </div>
                      <div className="command-item-main">
                        <span className="command-item-title">{action.label}</span>
                        <span className="command-item-meta">{action.category}</span>
                      </div>
                      <ArrowRight size={14} className="command-item-arrow" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {query.trim() && !loading && allItems.length === 0 && (
            <div className="command-empty-state">
              <Package size={28} className="command-empty-icon" />
              <p>No results found for &ldquo;{query}&rdquo;</p>
              <small>Try searching by SKU, customer phone, order #, or garment name</small>
            </div>
          )}

          {query.trim() && results.products.length > 0 && (
            <div className="command-section">
              <div className="command-section-title">Products ({results.products.length})</div>
              <div className="command-items-list">
                {results.products.map((p, idx) => {
                  const isSelected = selectedIndex === idx;
                  const primaryImg = p.image_url || (p.gallery_urls ? p.gallery_urls.split('\n')[0] : null);
                  return (
                    <div
                      key={p.id}
                      className={`command-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelect({ type: 'product', data: p })}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="command-item-avatar">
                        {primaryImg ? (
                          <img src={primaryImg} alt={p.title} />
                        ) : (
                          <Package size={16} />
                        )}
                      </div>
                      <div className="command-item-main">
                        <span className="command-item-title">{p.title}</span>
                        <span className="command-item-meta">
                          SKU: {p.sku} · {p.category} · Stock: {p.stock_quantity ?? 0}
                        </span>
                      </div>
                      <span className="command-item-price">{money(p.price)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {query.trim() && results.orders.length > 0 && (
            <div className="command-section">
              <div className="command-section-title">Orders ({results.orders.length})</div>
              <div className="command-items-list">
                {results.orders.map((o, idx) => {
                  const itemIndex = results.products.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      key={o.id}
                      className={`command-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelect({ type: 'order', data: o })}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div className="command-item-icon">
                        <ClipboardList size={16} />
                      </div>
                      <div className="command-item-main">
                        <span className="command-item-title">
                          {o.order_number} · {o.customer?.name || 'Walk-in Guest'}
                        </span>
                        <span className="command-item-meta">
                          Status: <span className={`status-pill ${o.status}`}>{o.status}</span> · {o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : ''}
                        </span>
                      </div>
                      <span className="command-item-price">{money(o.total_amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {query.trim() && results.customers.length > 0 && (
            <div className="command-section">
              <div className="command-section-title">Customers ({results.customers.length})</div>
              <div className="command-items-list">
                {results.customers.map((c, idx) => {
                  const itemIndex = results.products.length + results.orders.length + idx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <div
                      key={c.id}
                      className={`command-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelect({ type: 'customer', data: c })}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div className="command-item-icon">
                        <Users size={16} />
                      </div>
                      <div className="command-item-main">
                        <span className="command-item-title">{c.name}</span>
                        <span className="command-item-meta">{c.email || c.phone || 'Customer'}</span>
                      </div>
                      {c.tier && <span className={`customer-tier-badge tier-${c.tier}`}>{c.tier}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="command-palette-footer">
          <span className="command-footer-tip">
            <kbd className="command-kbd">↑</kbd> <kbd className="command-kbd">↓</kbd> to navigate
          </span>
          <span className="command-footer-tip">
            <kbd className="command-kbd">↵</kbd> to select
          </span>
          <span className="command-footer-tip">
            <kbd className="command-kbd">ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
