import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, ChevronUp, CreditCard, DollarSign,
  Heart, Minus, Package, Plus, Search, ShoppingBag, Smartphone, Star, Truck, X,
} from 'lucide-react';
import client from '../api/client';
import { apiError, money } from '../utils/format';
import './Storefront.css';

const collections = ['All pieces', 'New arrivals', 'Menswear', 'Womenswear', 'Wishlist'];

const DISCOUNT_CODES = {
  REIHH10: { type: 'percent', value: 10, label: '10% off — Spring special' },
  WELCOME: { type: 'percent', value: 15, label: '15% off — Welcome discount' },
  DEMO20: { type: 'percent', value: 20, label: '20% off — Demo special' },
  FLAT500: { type: 'fixed', value: 500, label: '₹500 off order' },
};

/* Generate or retrieve a persistent device-unique ID */
function getDeviceId() {
  const KEY = 'reihh-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/* Unique email per device so demo orders never clash across devices */
function deviceDemoEmail() {
  const deviceId = getDeviceId();
  return `demo-${deviceId.slice(0, 8)}@demo.reihh.com`;
}

function trackStoreEvent({ sessionId, eventType, product, variant, quantity = 1 }) {
  client.post('/storefront/events', {
    event_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    session_id: sessionId,
    event_type: eventType,
    product_id: product.id,
    variant_id: variant?.id || null,
    quantity,
    source: 'demo',
  }).catch(() => {});
}

export default function Storefront() {
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

  /* ── wishlist ── */
  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('reihh-wishlist') || '[]'); }
    catch { return []; }
  });

  /* ── cart ── */
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* ── multi-step checkout: 0=cart 1=info 2=payment 3=confirmed ── */
  const [checkoutStep, setCheckoutStep] = useState(0);

  /* Device-isolated customer state */
  const [customer, setCustomer] = useState(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('reihh-customer-info') || 'null'); }
      catch { return null; }
    })();
    return {
      name: saved?.name || '',
      email: deviceDemoEmail(),
      address: saved?.address || '42 Connaught Place, New Delhi 110001',
    };
  });

  const [paymentMethod, setPaymentMethod] = useState('demo_card');
  const [checkoutError, setCheckoutError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [simulationReceipt, setSimulationReceipt] = useState(null);

  /* ── discount ── */
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');

  /* ── fetch catalog ── */
  useEffect(() => {
    client.get('/storefront/products')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setError('The REIHH collection is temporarily unavailable. Please reload.'))
      .finally(() => setLoading(false));
  }, []);

  /* ── persist wishlist ── */
  useEffect(() => {
    sessionStorage.setItem('reihh-wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  /* ── persist local customer details ── */
  useEffect(() => {
    localStorage.setItem('reihh-customer-info', JSON.stringify({ name: customer.name, address: customer.address }));
  }, [customer.name, customer.address]);

  /* ── filter products ── */
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

  /* ── view analytics tracking ── */
  useEffect(() => {
    if (!gridRef.current || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const productId = entry.target.dataset.productId;
        if (!productId || viewedProducts.current.has(productId)) return;
        viewedProducts.current.add(productId);
        const product = filteredProducts.find((item) => item.id === productId);
        if (product) trackStoreEvent({ sessionId, eventType: 'product_view', product, variant: product.variants[0] });
      });
    }, { threshold: 0.35 });
    gridRef.current.querySelectorAll('[data-product-id]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [filteredProducts, sessionId]);

  /* ── totals ── */
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

  /* ── cart actions ── */
  const addToCart = (product) => {
    const variant = selectedVariant(product);
    if (!variant?.available) return;
    trackStoreEvent({ sessionId, eventType: 'add_to_cart', product, variant });
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
      if (product) trackStoreEvent({ sessionId, eventType: 'add_to_cart', product, variant: product.variants[0] });
      return [...prev, productId];
    });
  };

  const applyDiscount = () => {
    const code = discountInput.trim().toUpperCase();
    const match = DISCOUNT_CODES[code];
    if (!match) {
      setDiscountError('Invalid code. Try REIHH10, WELCOME, or DEMO20.');
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
      eventType: 'demo_checkout_started',
      product: line.product,
      variant: line.variant,
      quantity: line.quantity,
    }));
    setCheckoutStep(1);
  };

  const submitSimulation = async () => {
    setSubmitting(true);
    setCheckoutError('');
    try {
      const { data } = await client.post('/storefront/simulations', {
        customer_name: customer.name || 'Demo Customer',
        customer_email: customer.email,
        delivery_address: customer.address || '42 Connaught Place, New Delhi 110001',
        session_id: sessionId,
        discount_code: appliedDiscount?.code || null,
        payment_method: paymentMethod,
        items: cart.map((line) => ({ variant_id: line.variant.id, quantity: line.quantity })),
      });
      setSimulationReceipt(data);
      setCart([]);
      setAppliedDiscount(null);
      setCheckoutStep(3);
    } catch (err) {
      setCheckoutError(apiError(err, 'Could not complete demo order. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetCheckout = () => {
    setCheckoutStep(0);
    setCheckoutError('');
    setSimulationReceipt(null);
    setCartOpen(false);
  };

  const stockBadge = (product) => {
    const variant = selectedVariant(product);
    if (!variant?.available) return <i className="product-badge sold-out">Sold out</i>;
    const lowStock = product.variants.filter((v) => v.available).length <= 2;
    if (lowStock) return <i className="product-badge low-stock">Low stock</i>;
    if (product.collections?.includes('new-collections')) return <i className="product-badge new-badge">New</i>;
    return null;
  };

  /* ── Drawer content ── */
  const renderCartContent = () => {
    // Step 3: Confirmation
    if (checkoutStep === 3 && simulationReceipt) {
      return (
        <div className="order-confirmation">
          <div className="order-confirm-check"><Check size={32} /></div>
          <span className="store-kicker">Order confirmed &amp; simulated</span>
          <h3>{simulationReceipt.reference}</h3>
          <p className="order-confirm-sub">
            Payment verified via <strong>{paymentMethod === 'demo_card' ? 'Demo Card (Instant)' : paymentMethod === 'demo_upi' ? 'Demo UPI (Verified)' : 'Demo Cash on Delivery'}</strong>.
            Fulfillment point: <strong>REIHH Delhi Warehouse</strong>.
          </p>
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
            <span>Total amount</span>
            <strong>{money(simulationReceipt.total_amount)}</strong>
          </div>
          <div className="order-confirm-actions">
            <a
              className="store-checkout-button"
              href={`/delivery/demo/${simulationReceipt.delivery_token}`}
              target="_blank"
              rel="noreferrer"
            >
              Track delivery (Delivery Agent POV) <ArrowRight size={15} />
            </a>
            <a
              className="store-secondary-button"
              href="/orders"
              target="_blank"
              rel="noreferrer"
            >
              View in Merchant Orders →
            </a>
            <button className="store-continue-button" onClick={resetCheckout}>
              Continue shopping
            </button>
          </div>
        </div>
      );
    }

    // Step 0: Cart empty
    if (cart.length === 0 && checkoutStep === 0) {
      return (
        <div className="cart-empty">
          <ShoppingBag size={28} />
          <strong>Your bag is empty.</strong>
          <span>Explore the collection and select a piece.</span>
        </div>
      );
    }

    // Step 1: Customer Details
    if (checkoutStep === 1) {
      return (
        <div className="checkout-steps">
          <div className="step-indicators">
            {['Your Details', 'Payment Method', 'Confirmation'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Customer Information</h3>
          <p className="step-subheading">Enter your name and address. Each device's purchases stay isolated.</p>
          <label className="simulation-customer-field">
            Full name
            <input
              required
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              placeholder="e.g. Vikram Malhotra"
            />
          </label>
          <label className="simulation-customer-field">
            Email address
            <input
              required
              type="email"
              value={customer.email}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              placeholder="demo@reihh.com"
            />
            <small style={{ color: 'var(--store-muted)', fontSize: 10, marginTop: 4 }}>
              🔒 Auto-isolated for this device so other devices never overwrite your orders.
            </small>
          </label>
          <label className="simulation-customer-field">
            Delivery address
            <input
              required
              value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              placeholder="e.g. 42 Connaught Place, New Delhi 110001"
            />
          </label>
          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(0)}>← Bag</button>
            <button
              className="store-checkout-button step-next"
              disabled={!customer.name || !customer.email || !customer.address}
              onClick={() => setCheckoutStep(2)}
            >
              Continue to Payment <ArrowRight size={15} />
            </button>
          </div>
        </div>
      );
    }

    // Step 2: Payment method
    if (checkoutStep === 2) {
      return (
        <div className="checkout-steps">
          <div className="step-indicators">
            {['Your Details', 'Payment Method', 'Confirmation'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep - 1 ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Demo Payment</h3>
          <p className="step-subheading">Choose a simulated payment method. No real charges are made.</p>

          <div className="demo-payment-options">
            <label className={`demo-payment-option ${paymentMethod === 'demo_card' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="demo_card"
                checked={paymentMethod === 'demo_card'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <CreditCard size={18} />
              <div>
                <strong>Demo Visa / Mastercard</strong>
                <small>Simulated card (•••• 4242) · Instant approval</small>
              </div>
            </label>

            <label className={`demo-payment-option ${paymentMethod === 'demo_upi' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="demo_upi"
                checked={paymentMethod === 'demo_upi'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <Smartphone size={18} />
              <div>
                <strong>Demo UPI</strong>
                <small>UPI transfer · Simulated instant verification</small>
              </div>
            </label>

            <label className={`demo-payment-option ${paymentMethod === 'demo_cod' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="demo_cod"
                checked={paymentMethod === 'demo_cod'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <DollarSign size={18} />
              <div>
                <strong>Cash on Delivery (COD)</strong>
                <small>Pay delivery agent upon arrival in Delhi NCR</small>
              </div>
            </label>
          </div>

          {/* Discount section */}
          <div className="discount-section" style={{ marginTop: 16 }}>
            <button
              className="discount-toggle"
              type="button"
              onClick={() => setDiscountOpen((x) => !x)}
            >
              {discountOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {appliedDiscount ? `Applied: ${appliedDiscount.code}` : 'Have a discount code?'}
            </button>
            {discountOpen && (
              <div className="discount-input-row">
                {appliedDiscount ? (
                  <div className="discount-applied">
                    <Check size={14} />
                    <span>{appliedDiscount.label}</span>
                    <button type="button" className="discount-remove" onClick={removeDiscount}>Remove</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                      placeholder="REIHH10"
                      onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
                    />
                    <button type="button" className="discount-apply-btn" onClick={applyDiscount}>Apply</button>
                  </>
                )}
                {discountError && <p className="discount-error">{discountError}</p>}
              </div>
            )}
          </div>

          {/* Review summary */}
          <div className="review-customer">
            <p><strong>Deliver to:</strong> {customer.name} ({customer.email})</p>
            <p className="review-address">{customer.address}</p>
          </div>

          <div className="cart-summary">
            <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {appliedDiscount && (
              <div className="discount-row">
                <span>Discount ({appliedDiscount.code})</span>
                <span>−{money(discountAmount)}</span>
              </div>
            )}
            <div className="total-row"><span>Total</span><span>{money(orderTotal)}</span></div>
          </div>

          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(1)}>← Back</button>
            <button
              className="store-checkout-button step-next"
              disabled={submitting}
              onClick={submitSimulation}
            >
              {submitting ? 'Placing order…' : `Place demo order · ${money(orderTotal)}`} {!submitting && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      );
    }

    // Step 0: Cart review
    return (
      <>
        <div className="cart-lines">
          {cart.map((line) => (
            <div className="cart-line" key={line.variant.id}>
              {line.product.image_url ? (
                <img src={line.product.image_url} alt="" />
              ) : (
                <div className="product-placeholder" style={{ width: 76, height: 98 }}>REIHH</div>
              )}
              <div className="cart-line-body">
                <strong>{line.product.title}</strong>
                <small>{line.variant.title}</small>
                <span>{money(line.variant.price)}</span>
                <div className="cart-quantity">
                  <button onClick={() => changeQuantity(line.variant.id, -1)}><Minus size={12} /></button>
                  <span>{line.quantity}</span>
                  <button onClick={() => changeQuantity(line.variant.id, 1)}><Plus size={12} /></button>
                </div>
              </div>
              <b>{money(line.variant.price * line.quantity)}</b>
              <button className="cart-remove" onClick={() => removeFromCart(line.variant.id)}><X size={14} /></button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {appliedDiscount && (
            <div className="discount-row">
              <span>Discount ({appliedDiscount.code})</span>
              <span>−{money(discountAmount)}</span>
            </div>
          )}
          <div className="total-row">
            <span>Total</span>
            <span>{money(orderTotal)}</span>
          </div>
          <div className="free-shipping-row">
            <Truck size={14} />
            <span>Complimentary delivery across Delhi NCR</span>
          </div>
          <button
            className="store-checkout-button"
            disabled={!cart.length}
            onClick={startCheckout}
          >
            <span>Proceed to checkout</span>
            <span>{money(orderTotal)} →</span>
          </button>
        </div>
      </>
    );
  };

  /* ── Main Render ── */
  return (
    <div className="storefront">
      {/* Announcement Bar */}
      <div className="store-announcement">
        <span className="demo-badge">LIVE DEMO</span>
        <span>Connected to real REIHH fashion collection &amp; BizAI core</span>
        <span>•</span>
        <span>Every demo purchase updates merchant inventory &amp; Delhi tracking</span>
      </div>

      {/* Header */}
      <header className="store-header">
        <div className="store-links">
          <a href="https://reihh.com" target="_blank" rel="noreferrer">reihh.com ↗</a>
          <a href="/integrations" target="_blank" rel="noreferrer">Merchant Analytics</a>
          <a href="/orders" target="_blank" rel="noreferrer">Orders</a>
        </div>
        <a href="/store/demo" className="store-wordmark">REIHH<span>STUDIO</span></a>
        <button className="store-cart-button" onClick={() => { setCartOpen(true); if (checkoutStep !== 0 && checkoutStep !== 3) setCheckoutStep(0); }}>
          <div className="cart-btn-inner">
            <ShoppingBag size={15} />
            <span>Bag</span>
            <span className="cart-count">{lineCount}</span>
          </div>
        </button>
      </header>

      {/* Main layout */}
      <main className="store-main">
        {/* Hero Section */}
        <section className="store-hero">
          <div className="hero-content">
            <p className="store-kicker">Interactive Simulation</p>
            <h1>Every purchase syncs with <span>BizAI in real time.</span></h1>
            <p className="store-intro-copy">
              Select real REIHH fashion pieces, apply discounts, and complete a demo checkout. Your order updates merchant inventory, generates an invoice, and simulates a delivery run.
            </p>
            <div className="hero-actions">
              <button className="store-hero-btn" onClick={() => setCategory('All pieces')}>
                Explore Collection
              </button>
              <a className="store-original-link" href="https://reihh.com" target="_blank" rel="noreferrer">
                Official reihh.com →
              </a>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-circle hero-circle-1" />
            <div className="hero-circle hero-circle-2" />
            <div className="hero-text-art">REIHH</div>
          </div>
        </section>

        {/* Catalog Section */}
        <section className="store-catalog">
          <div className="catalog-heading">
            <div>
              <p className="store-kicker">Collection</p>
              <h2>{category} <small>({filteredProducts.length} pieces)</small></h2>
            </div>
            <div className="store-search">
              <Search size={14} />
              <input
                placeholder="Search catalog…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <nav className="store-filter">
            {collections.map((col) => (
              <button
                key={col}
                className={category === col ? 'selected' : ''}
                onClick={() => setCategory(col)}
              >
                {col} {col === 'Wishlist' && wishlist.length > 0 ? `(${wishlist.length})` : ''}
              </button>
            ))}
          </nav>

          {loading && (
            <div className="store-message store-message-loading">
              <span className="spinner" />
              <span>Loading live REIHH collection…</span>
            </div>
          )}

          {error && <div className="notice error">{error}</div>}

          <div className="store-product-grid" ref={gridRef}>
            {filteredProducts.map((product) => {
              const variant = selectedVariant(product);
              const inWishlist = wishlist.includes(product.id);
              return (
                <article
                  className="store-product"
                  key={product.id}
                  data-product-id={product.id}
                  onClick={() => trackStoreEvent({ sessionId, eventType: 'product_view', product, variant })}
                >
                  <div className="store-product-image-wrap">
                    <a className="store-product-image" href={product.product_url} target="_blank" rel="noreferrer">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.title} loading="lazy" />
                      ) : (
                        <div className="product-placeholder">REIHH</div>
                      )}
                    </a>
                    {stockBadge(product)}
                    <button
                      className={`wishlist-btn ${inWishlist ? 'wished' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id, product); }}
                      aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      <Heart size={14} fill={inWishlist ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="store-product-info">
                    <div className="store-product-title">
                      <a href={product.product_url} target="_blank" rel="noreferrer">{product.title}</a>
                      <span>{money(variant?.price || product.price)}</span>
                    </div>
                    <span className="product-category">{product.category}</span>

                    {product.variants.length > 1 && (
                      <label className="store-variant-select">
                        <span>Variant ({product.variants.length} available)</span>
                        <select
                          value={selectedVariants[product.id] || product.variants[0]?.id}
                          onChange={(e) => {
                            const vId = e.target.value;
                            setSelectedVariants((prev) => ({ ...prev, [product.id]: vId }));
                            const chosen = product.variants.find((v) => v.id === vId);
                            if (chosen) trackStoreEvent({ sessionId, eventType: 'variant_selected', product, variant: chosen });
                          }}
                        >
                          {product.variants.map((v) => (
                            <option key={v.id} value={v.id} disabled={!v.available}>
                              {v.options?.join(' / ') || v.title} {!v.available ? '(Sold out)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <button
                      className="store-add-button"
                      disabled={!variant?.available}
                      onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                    >
                      <span>{variant?.available ? '+ Add to bag' : 'Sold out'}</span>
                      <span>{money(variant?.price || product.price)}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && filteredProducts.length === 0 && (
            <div className="store-message">
              <p>No pieces found in this category or matching "{query}".</p>
            </div>
          )}
        </section>

        {/* Trust strip */}
        <section className="trust-strip">
          <div className="trust-item">
            <Package size={16} />
            <span>Real REIHH apparel catalog feed</span>
          </div>
          <div className="trust-item">
            <Truck size={16} />
            <span>Simulated fulfillment from Delhi Warehouse</span>
          </div>
          <div className="trust-item">
            <Check size={16} />
            <span>Instant invoice generated upon delivery</span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="store-footer">
        <span>REIHH × BizAI Demo Storefront · Orders do not bill real cards</span>
        <a href="https://reihh.com" target="_blank" rel="noreferrer">reihh.com</a>
        <a href="/integrations" target="_blank" rel="noreferrer">Merchant Analytics</a>
        <a href="/orders" target="_blank" rel="noreferrer">Merchant Orders</a>
      </footer>

      {/* Cart Backdrop & Drawer */}
      {cartOpen && (
        <div className={`store-cart-backdrop ${cartOpen ? 'open' : ''}`} onClick={() => setCartOpen(false)}>
          <aside className="store-cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-heading">
              <div>
                <p className="store-kicker">
                  {checkoutStep === 0 ? 'Your Bag' : checkoutStep === 3 ? 'Confirmed' : 'Checkout'}
                </p>
                <h2>
                  {checkoutStep === 0 ? 'Review selection' : checkoutStep === 3 ? 'Order confirmed' : 'Customer & Payment'}
                  <small>({lineCount} {lineCount === 1 ? 'item' : 'items'})</small>
                </h2>
              </div>
              <button onClick={() => setCartOpen(false)} aria-label="Close cart">
                <X size={18} />
              </button>
            </div>

            {renderCartContent()}
          </aside>
        </div>
      )}
    </div>
  );
}
