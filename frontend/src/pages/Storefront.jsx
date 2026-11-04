import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

/* Generate or retrieve a stable device-unique ID stored in localStorage */
function getDeviceId() {
  const KEY = 'reihh-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/* Build a device-scoped demo email that never clashes across devices */
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

  /* ── wishlist (session-persisted) ── */
  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('reihh-wishlist') || '[]'); }
    catch { return []; }
  });

  /* ── cart ── */
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* ── checkout multi-step: 0=cart 1=info 2=payment & review 3=done ── */
  const [checkoutStep, setCheckoutStep] = useState(0);

  /* Device-unique customer — name blank so each device enters their own */
  const [customer, setCustomer] = useState(() => {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('reihh-customer-info') || 'null'); }
      catch { return null; }
    })();
    return {
      name: saved?.name || '',
      email: deviceDemoEmail(),
      address: saved?.address || '',
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

  /* ── fetch products ── */
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

  /* ── persist customer name + address (but not device email) ── */
  useEffect(() => {
    localStorage.setItem('reihh-customer-info', JSON.stringify({ name: customer.name, address: customer.address }));
  }, [customer.name, customer.address]);

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
        if (product) trackStoreEvent({ sessionId, eventType: 'product_view', product, variant: product.variants[0] });
      });
    }, { threshold: 0.35 });
    gridRef.current.querySelectorAll('[data-product-id]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [filteredProducts, sessionId]);

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
        customer_name: customer.name,
        customer_email: customer.email,
        delivery_address: customer.address,
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
          <span className="store-kicker">Order confirmed &amp; paid</span>
          <h3>{simulationReceipt.reference}</h3>
          <p className="order-confirm-sub">
            Payment verified via <strong>{paymentMethod === 'demo_card' ? 'Demo Card (Instant)' : paymentMethod === 'demo_upi' ? 'Demo UPI (Verified)' : 'Demo Cash on Delivery'}</strong>.
            Estimated delivery: <strong>3–5 business days</strong>.
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
            <span>Amount paid</span>
            <strong>{money(simulationReceipt.total_amount)}</strong>
          </div>
          {simulationReceipt.invoice_number && (
            <div className="receipt-invoice-row">
              <span>🧾 Invoice</span>
              <strong>{simulationReceipt.invoice_number}</strong>
            </div>
          )}
          <div className="order-confirm-actions">
            <a
              className="store-checkout-button"
              href={`/delivery/demo/${simulationReceipt.delivery_token}`}
              target="_blank"
              rel="noreferrer"
            >
              Track delivery (Delivery Agent POV) <ArrowRight size={16} />
            </a>
            <a
              className="store-secondary-button"
              href="/orders"
              target="_blank"
              rel="noreferrer"
            >
              View in BizAI Merchant Orders →
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
            {['Customer info', 'Demo payment', 'Confirm'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Customer &amp; delivery info</h3>
          <p className="step-subheading">Enter your name and delivery address to simulate a live order.</p>
          <label className="simulation-customer-field">
            Full name
            <input
              required
              autoComplete="name"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              placeholder="Your name"
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
              placeholder="your@email.com"
            />
            <small className="field-hint">🔒 Auto-generated per device — stays unique across sessions</small>
          </label>
          <label className="simulation-customer-field">
            Delivery address
            <input
              required
              autoComplete="street-address"
              value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              placeholder="e.g. 42 Connaught Place, New Delhi 110001"
            />
          </label>
          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(0)}>← Back to bag</button>
            <button
              className="store-checkout-button step-next"
              disabled={!customer.name || !customer.email || !customer.address}
              onClick={() => setCheckoutStep(2)}
            >
              Payment method <ArrowRight size={15} />
            </button>
          </div>
        </div>
      );
    }

    // Step 2: Payment method & Review
    if (checkoutStep === 2) {
      return (
        <div className="checkout-steps">
          <div className="step-indicators">
            {['Customer info', 'Demo payment', 'Confirm'].map((label, i) => (
              <div key={label} className={`step-indicator ${i < checkoutStep - 1 ? 'done' : i === checkoutStep - 1 ? 'active' : ''}`}>
                <span>{i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <h3 className="step-heading">Demo payment selection</h3>
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
                <small>Simulated card (•••• 4242) · Instant auto-approval</small>
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
                <small>demo@upi · Auto-verified payment</small>
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
                <strong>Demo Cash on Delivery</strong>
                <small>Pay ₹ cash to delivery agent on arrival</small>
              </div>
            </label>
          </div>

          {/* Discount */}
          <div className="discount-section">
            <button
              className="discount-toggle"
              type="button"
              onClick={() => setDiscountOpen((x) => !x)}
            >
              {discountOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {appliedDiscount ? `Discount applied: ${appliedDiscount.code}` : 'Have a discount code?'}
            </button>
            {discountOpen && (
              <div className="discount-row">
                {appliedDiscount ? (
                  <>
                    <span className="discount-applied-pill">{appliedDiscount.label}</span>
                    <button type="button" className="remove-discount" onClick={removeDiscount}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <input
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                      placeholder="REIHH10"
                      onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
                    />
                    <button type="button" className="apply-discount-btn" onClick={applyDiscount}>Apply</button>
                  </>
                )}
                {discountError && <p className="discount-error">{discountError}</p>}
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="checkout-summary">
            <div className="checkout-summary-heading">Order summary</div>
            {cart.map((line) => (
              <div className="checkout-summary-line" key={line.variant.id}>
                {line.product.image_url && <img src={line.product.image_url} alt="" />}
                <span>
                  <strong>{line.product.title}</strong>
                  <small>{line.variant.title} × {line.quantity}</small>
                </span>
                <b>{money(line.variant.price * line.quantity)}</b>
              </div>
            ))}
            <div className="checkout-summary-totals">
              <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {appliedDiscount && <div className="discount-line"><span>Discount ({appliedDiscount.code})</span><span>−{money(discountAmount)}</span></div>}
              <div className="total-line"><span>Total</span><strong>{money(orderTotal)}</strong></div>
            </div>
          </div>

          {checkoutError && <p className="simulation-error">{checkoutError}</p>}
          <div className="step-nav">
            <button className="store-continue-button" onClick={() => setCheckoutStep(1)}>← Back</button>
            <button
              className="store-checkout-button step-next"
              disabled={submitting}
              onClick={submitSimulation}
            >
              {submitting ? 'Processing…' : `Place demo order · ${money(orderTotal)}`} {!submitting && <Check size={15} />}
            </button>
          </div>
        </div>
      );
    }

    // Step 0: Cart
    return (
      <>
        <div className="cart-items">
          {cart.map((line) => (
            <div className="cart-line" key={line.variant.id}>
              {line.product.image_url && (
                <img src={line.product.image_url} className="cart-line-image" alt="" />
              )}
              <div className="cart-line-info">
                <strong>{line.product.title}</strong>
                <small>{line.variant.title}</small>
                <span>{money(line.variant.price)}</span>
              </div>
              <div className="cart-qty-row">
                <button onClick={() => changeQuantity(line.variant.id, -1)}><Minus size={13} /></button>
                <span>{line.quantity}</span>
                <button onClick={() => changeQuantity(line.variant.id, 1)}><Plus size={13} /></button>
                <button className="cart-remove" onClick={() => removeFromCart(line.variant.id)}><X size={13} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Discount preview */}
        <div className="discount-section">
          <button
            className="discount-toggle"
            type="button"
            onClick={() => setDiscountOpen((x) => !x)}
          >
            {discountOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {appliedDiscount ? `Discount: ${appliedDiscount.code}` : 'Add discount code'}
          </button>
          {discountOpen && (
            <div className="discount-row">
              {appliedDiscount ? (
                <>
                  <span className="discount-applied-pill">{appliedDiscount.label}</span>
                  <button type="button" className="remove-discount" onClick={removeDiscount}><X size={13} /></button>
                </>
              ) : (
                <>
                  <input
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                    placeholder="REIHH10"
                    onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
                  />
                  <button type="button" className="apply-discount-btn" onClick={applyDiscount}>Apply</button>
                </>
              )}
              {discountError && <p className="discount-error">{discountError}</p>}
            </div>
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-subtotal">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          {appliedDiscount && (
            <div className="cart-subtotal discount-line">
              <span>Discount</span>
              <span>−{money(discountAmount)}</span>
            </div>
          )}
          <div className="cart-subtotal total-line">
            <span>Total</span>
            <strong>{money(orderTotal)}</strong>
          </div>
          <button
            className="store-checkout-button full-width"
            disabled={!cart.length}
            onClick={startCheckout}
          >
            Checkout <ArrowRight size={16} />
          </button>
        </div>
      </>
    );
  };

  /* ── main render ── */
  return (
    <div className="storefront-root">
      {/* ── Navbar ── */}
      <nav className="store-nav">
        <div className="store-nav-inner">
          <a className="store-brand" href="/store/demo">REIHH</a>
          <div className="store-nav-right">
            <div className="store-search-wrap">
              <Search size={15} />
              <input
                className="store-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pieces…"
              />
            </div>
            <button
              className="store-cart-btn"
              onClick={() => { setCartOpen(true); if (checkoutStep !== 0 && checkoutStep !== 3) setCheckoutStep(0); }}
            >
              <ShoppingBag size={18} />
              {lineCount > 0 && <span className="cart-badge">{lineCount}</span>}
            </button>
          </div>
        </div>
        {/* Collection tabs */}
        <div className="store-collection-tabs">
          {collections.map((col) => (
            <button
              key={col}
              className={`store-col-tab ${category === col ? 'active' : ''}`}
              onClick={() => setCategory(col)}
            >
              {col}
              {col === 'Wishlist' && wishlist.length > 0 && <span>{wishlist.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="store-hero">
        <div className="store-hero-inner">
          <p className="store-eyebrow">REIHH × BizAI Demo Store</p>
          <h1>Premium fashion.<br />Live analytics.</h1>
          <p className="store-hero-sub">Every action you take here — browsing, adding to cart, checking out — feeds real data into the BizAI merchant dashboard.</p>
          <div className="store-hero-actions">
            <button className="store-checkout-button" onClick={() => setCategory('All pieces')}>Shop the collection</button>
            <a className="store-secondary-button" href="/integrations" target="_blank" rel="noreferrer">View analytics dashboard →</a>
          </div>
        </div>
      </section>

      {/* ── Grid ── */}
      <section className="store-grid-section">
        <div className="store-grid-header">
          <h2>{category}</h2>
          <span className="store-grid-count">{filteredProducts.length} pieces</span>
        </div>

        {loading && <div className="store-loading"><Package size={24} /><span>Loading REIHH collection…</span></div>}
        {error && <div className="store-error-banner">{error}</div>}

        <div className="store-grid" ref={gridRef}>
          {filteredProducts.map((product) => {
            const variant = selectedVariant(product);
            const inWishlist = wishlist.includes(product.id);
            const otherVariants = product.variants.filter((v) => v.id !== variant?.id);
            return (
              <article
                className="product-card"
                key={product.id}
                data-product-id={product.id}
                onClick={() => trackStoreEvent({ sessionId, eventType: 'product_view', product, variant })}
              >
                <div className="product-image-wrap">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.title} className="product-img" loading="lazy" />
                    : <div className="product-img-placeholder"><Package size={32} /></div>}
                  {stockBadge(product)}
                  <button
                    className={`wishlist-btn ${inWishlist ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id, product); }}
                    aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart size={15} fill={inWishlist ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="product-info">
                  <span className="product-category">{product.category}</span>
                  <h3 className="product-title">
                    <a href={product.product_url} target="_blank" rel="noreferrer">{product.title}</a>
                  </h3>
                  <div className="product-stars">
                    {[1,2,3,4,5].map((i) => <Star key={i} size={11} fill="currentColor" />)}
                    <small>({Math.floor(Math.random() * 80) + 20})</small>
                  </div>
                  <p className="product-price">{money(variant?.price || product.price)}</p>

                  {/* Variant selector */}
                  {product.variants.length > 1 && (
                    <div className="variant-selector">
                      {product.variants.slice(0, 6).map((v) => (
                        <button
                          key={v.id}
                          className={`variant-pill ${selectedVariants[product.id] === v.id || (!selectedVariants[product.id] && product.variants[0]?.id === v.id) ? 'active' : ''} ${!v.available ? 'sold-out-pill' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariants((prev) => ({ ...prev, [product.id]: v.id }));
                            trackStoreEvent({ sessionId, eventType: 'variant_selected', product, variant: v });
                          }}
                        >
                          {v.options?.[0] || v.title}
                        </button>
                      ))}
                      {product.variants.length > 6 && <span className="more-variants">+{product.variants.length - 6}</span>}
                    </div>
                  )}

                  <button
                    className={`add-to-bag-btn ${!variant?.available ? 'disabled' : ''}`}
                    disabled={!variant?.available}
                    onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                  >
                    {variant?.available ? <><Plus size={15} /> Add to bag</> : 'Sold out'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && filteredProducts.length === 0 && (
          <div className="store-empty">
            <Package size={28} />
            <strong>No pieces found.</strong>
            <span>Try a different filter or search term.</span>
          </div>
        )}
      </section>

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <div className="cart-overlay" onClick={() => setCartOpen(false)}>
          <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-drawer-header">
              <h2>
                {checkoutStep === 0 ? 'Your bag' : checkoutStep === 3 ? 'Order confirmed' : 'Checkout'}
                {checkoutStep === 0 && lineCount > 0 && <span className="cart-count-label">{lineCount} items</span>}
              </h2>
              <button className="cart-close" onClick={() => setCartOpen(false)}><X size={19} /></button>
            </div>
            <div className="cart-drawer-body">
              {renderCartContent()}
            </div>
          </aside>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="store-footer">
        <div className="store-footer-inner">
          <span>REIHH × BizAI Demo Store — all orders are simulated, no real payments are processed.</span>
          <div className="store-footer-links">
            <a href="https://reihh.com" target="_blank" rel="noreferrer">reihh.com</a>
            <a href="/integrations" target="_blank" rel="noreferrer">Merchant analytics</a>
            <a href="/orders" target="_blank" rel="noreferrer">Orders</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
