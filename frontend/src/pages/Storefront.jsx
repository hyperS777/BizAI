import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronDown, ChevronUp, Heart, Minus, Plus,
  Search, ShoppingBag, Star, Truck, X,
} from 'lucide-react';
import client from '../api/client';
import { apiError, money } from '../utils/format';
import './Storefront.css';

const collections = ['All pieces', 'New arrivals', 'Menswear', 'Womenswear', 'Wishlist'];

const DISCOUNT_CODES = {
  REIHH10: { type: 'percent', value: 10, label: '10% off' },
  WELCOME: { type: 'percent', value: 15, label: '15% off — Welcome discount' },
  DEMO20: { type: 'percent', value: 20, label: '20% off — Demo special' },
  FLAT500: { type: 'fixed', value: 500, label: '₹500 off' },
};

function trackStoreEvent({ sessionId, source, eventType, product, variant, quantity = 1 }) {
  client.post('/storefront/events', {
    event_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    session_id: sessionId,
    event_type: eventType,
    product_id: product.id,
    variant_id: variant?.id || null,
    quantity,
    source,
  }).catch(() => {});
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`;
}

export default function Storefront() {
  const location = useLocation();
  const isSimulation = location.pathname === '/store/demo';

  const [sessionId] = useState(() => {
    const key = 'reihh-store-session';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, created);
    return created;
  });

  const gridRef = useRef(null);
  const viewedProducts = useRef(new Set());

  /* ── product state ── */
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All pieces');
  const [query, setQuery] = useState('');
  const [selectedVariants, setSelectedVariants] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── wishlist (session-persisted) ── */
  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('reihh-wishlist') || '[]'); }
    catch { return []; }
  });

  /* ── cart ── */
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* ── checkout multi-step ── */
  const [checkoutStep, setCheckoutStep] = useState(0); // 0=cart 1=info 2=review 3=done
  const [customer, setCustomer] = useState({ name: '', email: '', address: '' });
  const [checkoutError, setCheckoutError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [simulationReceipt, setSimulationReceipt] = useState(null);

  /* ── discount ── */
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');

  /* ── fetch products ── */
  useEffect(() => {
    client.get('/storefront/products')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setError('The REIHH collection is temporarily unavailable. Please visit reihh.com to shop.'))
      .finally(() => setLoading(false));
  }, []);

  /* ── persist wishlist ── */
  useEffect(() => {
    sessionStorage.setItem('reihh-wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  /* ── filter ── */
  const filteredProducts = useMemo(() => {
    if (category === 'Wishlist') {
      return products.filter((p) => wishlist.includes(p.id));
    }
    return products.filter((product) => {
      const matchesCategory = category === 'All pieces'
        || (category === 'New arrivals' ? product.collections?.includes('new-collections') : product.category === category);
      const matchesSearch = !query || `${product.title} ${product.category}`.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, category, query, wishlist]);

  /* ── intersection observer for product view tracking ── */
  useEffect(() => {
    if (!gridRef.current || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const productId = entry.target.dataset.productId;
        if (!productId || viewedProducts.current.has(productId)) return;
        viewedProducts.current.add(productId);
        const product = filteredProducts.find((item) => item.id === productId);
        if (product) trackStoreEvent({ sessionId, source: isSimulation ? 'demo' : 'live', eventType: 'product_view', product, variant: product.variants[0] });
      });
    }, { threshold: 0.35 });
    gridRef.current.querySelectorAll('[data-product-id]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [filteredProducts, sessionId, isSimulation]);

  /* ── derived ── */
  const lineCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
  const discountAmount = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round(subtotal * appliedDiscount.value / 100)
      : Math.min(appliedDiscount.value, subtotal)
    : 0;
  const orderTotal = Math.max(0, subtotal - discountAmount);

  const selectedVariant = (product) => {
    const currentId = selectedVariants[product.id];
    return product.variants.find((v) => v.id === currentId)
      || product.variants.find((v) => v.available)
      || product.variants[0];
  };

  /* ── actions ── */
  const addToCart = (product) => {
    const variant = selectedVariant(product);
    if (!variant?.available) return;
    trackStoreEvent({ sessionId, source: isSimulation ? 'demo' : 'live', eventType: 'add_to_cart', product, variant });
    setCart((current) => {
      const found = current.find((line) => line.variant.id === variant.id);
      return found
        ? current.map((line) => line.variant.id === variant.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, variant, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const changeQuantity = (variantId, delta) => {
    setCart((current) => current
      .map((line) => line.variant.id === variantId ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0));
  };

  const removeFromCart = (variantId) => {
    setCart((current) => current.filter((line) => line.variant.id !== variantId));
  };

  const toggleWishlist = (productId, product) => {
    setWishlist((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId);
      // fire-and-forget wishlist_add event
      if (product) trackStoreEvent({ sessionId, source: isSimulation ? 'demo' : 'live', eventType: 'add_to_cart', product, variant: product.variants[0] });
      return [...prev, productId];
    });
  };

  const applyDiscount = () => {
    const code = discountInput.trim().toUpperCase();
    const match = DISCOUNT_CODES[code];
    if (!match) {
      setDiscountError('Invalid discount code.');
      setAppliedDiscount(null);
      return;
    }
    setAppliedDiscount({ ...match, code });
    setDiscountError('');
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput('');
    setDiscountError('');
  };

  const startCheckout = () => {
    if (!cart.length) return;
    cart.forEach((line) => trackStoreEvent({
      sessionId,
      source: isSimulation ? 'demo' : 'live',
      eventType: isSimulation ? 'demo_checkout_started' : 'checkout_started',
      product: line.product,
      variant: line.variant,
      quantity: line.quantity,
    }));
    if (isSimulation) {
      setCheckoutStep(1);
    } else {
      const items = cart.map((line) => `${line.variant.id}:${line.quantity}`).join(',');
      window.location.assign(`https://reihh.com/cart/${items}`);
    }
  };

  const submitSimulation = async () => {
    setSubmitting(true);
    setCheckoutError('');
    try {
      const { data } = await client.post('/storefront/simulations', {
        customer_name: customer.name,
        customer_email: customer.email,
        delivery_address: customer.address,
        session_id: sessionId,
        discount_code: appliedDiscount?.code || null,
        items: cart.map((line) => ({ variant_id: line.variant.id, quantity: line.quantity })),
      });
      setSimulationReceipt(data);
      setCart([]);
      setAppliedDiscount(null);
      setCheckoutStep(3);
    } catch (err) {
      setCheckoutError(apiError(err, 'Could not record this simulation. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetCheckout = () => {
    setCheckoutStep(0);
    setCustomer({ name: '', email: '', address: '' });
    setCheckoutError('');
    setSimulationReceipt(null);
    setCartOpen(false);
  };

  /* ── badge on product image ── */
  const stockBadge = (product) => {
    const variant = selectedVariant(product);
    if (!variant?.available) return <i className="product-badge sold-out">Sold out</i>;
    const lowStock = product.variants.filter((v) => v.available).length <= 2;
    if (lowStock) return <i className="product-badge low-stock">Low stock</i>;
    if (product.collections?.includes('new-collections')) return <i className="product-badge new-badge">New</i>;
    return null;
  };

  /* ── cart drawer content ── */
  const renderCartContent = () => {
    // Step 3: Order confirmed
    if (checkoutStep === 3 && simulationReceipt) {
      return (
        <div className="order-confirmation">
          <div className="order-confirm-check"><Check size={32} /></div>
          <span className="store-kicker">Order confirmed</span>
          <h3>{simulationReceipt.reference}</h3>
          <p className="order-confirm-sub">Your order has been placed. Estimated delivery: <strong>3–5 business days</strong></p>
          <div className="order-receipt-items">
            {simulationReceipt.items?.map((item) => (
              <div className="receipt-line" key={item.variant_id}>
                {item.image_url && <img src={item.image_url} alt="" />}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.variant_title} · Qty {item.quantity}</small>
                </span>
                <b>{money(item.line_total)}</b>
              </div>
            ))}
          </div>
          <div className="receipt-total-row">
            <span>Order total</span>
            <strong>{money(simulationReceipt.total_amount)}</strong>
          </div>
          <div className="order-confirm-actions">
            <a
              className="store-checkout-button"
              href={`/delivery/demo/${simulationReceipt.delivery_token}`}
              target="_blank"
              rel="noreferrer"
            >
              Track delivery <ArrowRight size={16} />
            </a>
            <button className="store-continue-button" onClick={resetCheckout}>
              Continue shopping
            </button>
          </div>
        </div>
      );
    }

    // Empty cart
    if (cart.length === 0 && checkoutStep === 0) {
      return (
        <div className="cart-empty">
          <ShoppingBag size={28} />
          <strong>Your bag is waiting.</strong>
          <span>Explore the collection and add a piece.</span>
        </div>
      );
    }

    // Step 1: Customer info form
    if (checkoutStep === 1) {
      return (
        <div className="checkout-steps">
          <div className="step-indicators">
            {['Customer info', 'Review order', 'Confirm'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Your information</h3>
          <label className="simulation-customer-field">
            Full name
            <input
              required
              autoComplete="name"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              placeholder="Jane Smith"
            />
          </label>
          <label className="simulation-customer-field">
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={customer.email}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              placeholder="jane@example.com"
            />
          </label>
          <label className="simulation-customer-field">
            Delivery address
            <input
              required
              autoComplete="street-address"
              value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              placeholder="Street, city, state, PIN"
            />
          </label>
          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(0)}>← Back</button>
            <button
              className="store-checkout-button step-next"
              disabled={!customer.name || !customer.email || !customer.address}
              onClick={() => setCheckoutStep(2)}
            >
              Review order <ArrowRight size={15} />
            </button>
          </div>
        </div>
      );
    }

    // Step 2: Review order
    if (checkoutStep === 2) {
      return (
        <div className="checkout-steps">
          <div className="step-indicators">
            {['Customer info', 'Review order', 'Confirm'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep - 1 ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Review your order</h3>
          <div className="review-customer">
            <p><strong>{customer.name}</strong> · {customer.email}</p>
            <p className="review-address">{customer.address}</p>
          </div>
          <div className="cart-lines review-lines">
            {cart.map(({ product, variant, quantity }) => (
              <article className="cart-line" key={variant.id}>
                {product.image_url && <img src={product.image_url} alt="" />}
                <div className="cart-line-body">
                  <strong>{product.title}</strong>
                  <small>{variant.title}</small>
                  <span>{money(variant.price)} × {quantity}</span>
                </div>
                <b>{money(variant.price * quantity)}</b>
              </article>
            ))}
          </div>
          <div className="cart-summary">
            <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            {appliedDiscount && <div className="discount-row"><span>Discount ({appliedDiscount.code})</span><strong className="discount-value">−{money(discountAmount)}</strong></div>}
            <div className="total-row"><span>Total</span><strong>{money(orderTotal)}</strong></div>
            <div className="free-shipping-row"><Truck size={13} /> FREE delivery estimated in 3–5 business days</div>
          </div>
          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(1)}>← Back</button>
            <button
              className="store-checkout-button step-next"
              disabled={submitting}
              onClick={submitSimulation}
            >
              {submitting ? 'Placing order…' : 'Place order'} <ArrowRight size={15} />
            </button>
          </div>
          <p className="simulation-note"><Check size={13} /> Test simulation — no real payment or stock change</p>
        </div>
      );
    }

    // Step 0: Cart
    return (
      <>
        <div className="cart-lines">
          {cart.map(({ product, variant, quantity }) => (
            <article className="cart-line" key={variant.id}>
              {product.image_url && <img src={product.image_url} alt="" />}
              <div className="cart-line-body">
                <strong>{product.title}</strong>
                <small>{variant.title}</small>
                <span>{money(variant.price)}</span>
                <div className="cart-quantity">
                  <button onClick={() => changeQuantity(variant.id, -1)} aria-label={`Remove one ${product.title}`}><Minus size={13} /></button>
                  <span>{quantity}</span>
                  <button onClick={() => changeQuantity(variant.id, 1)} aria-label={`Add one ${product.title}`}><Plus size={13} /></button>
                </div>
              </div>
              <button className="cart-remove" onClick={() => removeFromCart(variant.id)} aria-label={`Remove ${product.title}`}><X size={15} /></button>
            </article>
          ))}
        </div>
        <div className="cart-summary">
          {isSimulation && (
            <div className="discount-section">
              <button
                className="discount-toggle"
                onClick={() => setDiscountOpen((o) => !o)}
                aria-expanded={discountOpen}
              >
                Have a discount code? {discountOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {discountOpen && (
                <div className="discount-input-row">
                  <input
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                    placeholder="Enter code (e.g. REIHH10)"
                    onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
                  />
                  <button onClick={applyDiscount} className="discount-apply-btn">Apply</button>
                </div>
              )}
              {discountError && <p className="discount-error">{discountError}</p>}
              {appliedDiscount && (
                <p className="discount-applied">
                  <Check size={13} /> {appliedDiscount.label}
                  <button onClick={removeDiscount} className="discount-remove">Remove</button>
                </p>
              )}
            </div>
          )}
          <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          {appliedDiscount && <div className="discount-row"><span>Discount ({appliedDiscount.code})</span><strong className="discount-value">−{money(discountAmount)}</strong></div>}
          {appliedDiscount && <div className="total-row"><span>Total</span><strong>{money(orderTotal)}</strong></div>}
          <div className="free-shipping-row"><Truck size={13} /> FREE delivery</div>
          {isSimulation ? (
            <>
              <button className="store-checkout-button" onClick={startCheckout}>
                Checkout — {money(orderTotal)} <ArrowRight size={16} />
              </button>
              <p className="simulation-note"><Check size={13} /> Test record only — no real payment or stock change</p>
            </>
          ) : (
            <>
              <small>Shipping and payment options are calculated at REIHH checkout.</small>
              <button className="store-checkout-button" onClick={startCheckout}>Continue to REIHH checkout <ArrowRight size={16} /></button>
              <p className="simulation-note"><Check size={13} /> Secure checkout on reihh.com</p>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="storefront">
      {/* Announcement bar */}
      <div className="store-announcement">
        {isSimulation
          ? <><span className="demo-badge">DEMO</span> No payment will be taken · Test orders are kept separate</>
          : <>Complimentary domestic shipping <span>•</span> Flexible payment at checkout</>
        }
        <a href={isSimulation ? '/store' : '/store/demo'}>{isSimulation ? 'Live store →' : 'Customer demo →'}</a>
      </div>

      {/* Header */}
      <header className="store-header">
        <a className="store-wordmark" href="https://reihh.com/" aria-label="REIHH home">REIHH<span>®</span></a>
        <nav className="store-links" aria-label="Store collections">
          <a href="https://reihh.com/collections/menswear">Menswear</a>
          <a href="https://reihh.com/collections/womenswear">Womenswear</a>
          <a href="https://reihh.com/collections/new-collections">New collections</a>
          <a href="https://reihh.com/collections/best-sellers">Best sellers</a>
        </nav>
        <button className="store-cart-button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${lineCount} items`}>
          <div className="cart-btn-inner">
            <ShoppingBag size={19} />
            <span>Bag</span>
            {lineCount > 0 && <b className="cart-count">{lineCount}</b>}
          </div>
        </button>
      </header>

      <main className="store-main">
        {/* Hero section */}
        <section className="store-hero">
          <div className="hero-content">
            <p className="store-kicker">{isSimulation ? 'Customer checkout simulation' : 'REIHH · Spring / Summer 26'}</p>
            <h1>
              {isSimulation
                ? <><span>Try the</span><br />REIHH journey.</>
                : <><span>Pieces with</span><br />presence.</>
              }
            </h1>
            <p className="store-intro-copy">
              {isSimulation
                ? 'Try the REIHH customer journey with live products. This preview never places or charges a real order.'
                : 'Modern silhouettes, considered details, and expressive everyday dressing.'
              }
            </p>
            <a className="store-original-link" href={isSimulation ? '/store' : 'https://reihh.com/collections/all'}>
              {isSimulation ? 'Switch to live REIHH checkout' : 'Visit the original REIHH store'} <ArrowRight size={15} />
            </a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-circle hero-circle-1" />
            <div className="hero-circle hero-circle-2" />
            <div className="hero-text-art">REIHH</div>
          </div>
        </section>

        {/* Catalog */}
        <section className="store-catalog" aria-label="REIHH product catalog">
          <div className="catalog-heading">
            <div>
              <span className="store-kicker">{isSimulation ? 'Preview products' : 'The collection'}</span>
              <h2>
                {category === 'Wishlist' ? 'Your wishlist' : isSimulation ? 'Build a test bag' : 'Shop the edit'}
                {' '}<small>{filteredProducts.length}</small>
              </h2>
            </div>
            <label className="store-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pieces"
                aria-label="Search products"
              />
            </label>
          </div>

          <div className="store-filter" role="tablist" aria-label="Filter collections">
            {collections.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={category === item}
                className={category === item ? 'selected' : ''}
                onClick={() => setCategory(item)}
              >
                {item === 'Wishlist' ? <><Heart size={12} /> Wishlist {wishlist.length > 0 ? `(${wishlist.length})` : ''}</> : item}
              </button>
            ))}
          </div>

          {error && <div className="store-message">{error}</div>}
          {loading && <div className="store-message store-message-loading"><span className="spinner" />Loading the REIHH collection…</div>}
          {!loading && !error && filteredProducts.length === 0 && (
            <div className="store-message">
              {category === 'Wishlist' ? 'No wishlisted pieces yet. Click the ♡ on any product to save it.' : 'No pieces match this search.'}
            </div>
          )}

          <div className="store-product-grid" ref={gridRef}>
            {filteredProducts.map((product) => {
              const variant = selectedVariant(product);
              const isWished = wishlist.includes(product.id);
              return (
                <article className="store-product" key={product.id} data-product-id={product.id}>
                  <div className="store-product-image-wrap">
                    <a className="store-product-image" href={product.product_url} target="_blank" rel="noreferrer">
                      {product.image_url
                        ? <img src={product.image_url} alt={product.title} loading="lazy" />
                        : <span className="product-placeholder">REIHH</span>
                      }
                    </a>
                    {stockBadge(product)}
                    <button
                      className={`wishlist-btn ${isWished ? 'wished' : ''}`}
                      onClick={() => toggleWishlist(product.id, product)}
                      aria-label={isWished ? `Remove ${product.title} from wishlist` : `Add ${product.title} to wishlist`}
                      title={isWished ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      <Heart size={16} fill={isWished ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="store-product-info">
                    <div className="store-product-title">
                      <a href={product.product_url} target="_blank" rel="noreferrer">{product.title}</a>
                      <span>{money(product.price)}</span>
                    </div>
                    <small className="product-category">{product.category}</small>
                    {product.variants.length > 1 && (
                      <label className="store-variant-select">
                        <span>{variant?.title || 'Select option'}</span>
                        <select
                          value={variant?.id || ''}
                          onChange={(e) => {
                            const nextVariant = product.variants.find((v) => v.id === e.target.value);
                            setSelectedVariants({ ...selectedVariants, [product.id]: e.target.value });
                            if (nextVariant) trackStoreEvent({ sessionId, source: isSimulation ? 'demo' : 'live', eventType: 'variant_selected', product, variant: nextVariant });
                          }}
                          aria-label={`Choose variant for ${product.title}`}
                        >
                          {product.variants.map((v) => (
                            <option key={v.id} value={v.id} disabled={!v.available}>
                              {v.title}{v.available ? '' : ' · sold out'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      className="store-add-button"
                      disabled={!variant?.available}
                      onClick={() => addToCart(product)}
                    >
                      {variant?.available ? 'Add to bag' : 'Sold out'} {variant?.available && <Plus size={14} />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Trust strip */}
        <section className="trust-strip">
          <div className="trust-item"><Truck size={16} /><span>Free delivery on all orders</span></div>
          <div className="trust-item"><Star size={16} /><span>Genuine REIHH products</span></div>
          <div className="trust-item"><Check size={16} /><span>Easy returns &amp; exchanges</span></div>
        </section>
      </main>

      <footer className="store-footer">
        <a href="https://reihh.com/pages/returns-exchanges">Returns &amp; exchanges</a>
        <a href="https://reihh.com/pages/shipping">Shipping</a>
        <a href={isSimulation ? '/store' : '/store/demo'}>{isSimulation ? 'Live storefront' : 'Customer preview'}</a>
        <span>{isSimulation ? 'Simulation records never create payments or live orders.' : 'Checkout and payment are securely completed on REIHH.'}</span>
      </footer>

      {/* Cart drawer */}
      {cartOpen && (
        <div
          className={`store-cart-backdrop ${cartOpen ? 'open' : ''}`}
          onClick={() => { setCartOpen(false); if (checkoutStep > 0 && checkoutStep < 3) setCheckoutStep(0); }}
          role="presentation"
        >
          <aside
            className="store-cart-drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Shopping bag"
          >
            <div className="cart-heading">
              <div>
                <span className="store-kicker">
                  {checkoutStep === 0 ? 'Your selection' : checkoutStep === 1 ? 'Step 1 of 3' : checkoutStep === 2 ? 'Step 2 of 3' : 'Order confirmed'}
                </span>
                <h2>
                  {checkoutStep === 0 ? 'Shopping bag' : checkoutStep === 1 ? 'Customer info' : checkoutStep === 2 ? 'Review order' : 'Order placed!'}
                  {checkoutStep === 0 && lineCount > 0 && <small>{lineCount}</small>}
                </h2>
              </div>
              <button
                onClick={() => { setCartOpen(false); if (checkoutStep > 0 && checkoutStep < 3) setCheckoutStep(0); }}
                aria-label="Close shopping bag"
              >
                <X size={21} />
              </button>
            </div>
            {renderCartContent()}
          </aside>
        </div>
      )}
    </div>
  );
}
