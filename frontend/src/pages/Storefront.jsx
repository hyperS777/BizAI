import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, ChevronUp, Clock, CreditCard, DollarSign, MessageCircle, QrCode, ShieldCheck,
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
  const [drawerTab, setDrawerTab] = useState('bag'); // 'bag' | 'orders'

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
      phone: saved?.phone || '+91 98765 43210',
      address: saved?.address || '42 Connaught Place, New Delhi 110001',
      whatsappUpdates: saved?.whatsappUpdates ?? true,
    };
  });

  const [paymentMethod, setPaymentMethod] = useState('demo_card');
  /* ── Payment Modes: 'demo' (instant) | 'real_demo' (interactive sandbox) ── */
  const [paymentMode, setPaymentMode] = useState('real_razorpay');
  const [sortBy, setSortBy] = useState('featured');
  const [priceFilter, setPriceFilter] = useState('all');
  const [sandboxModal, setSandboxModal] = useState(null); // 'card_otp' | 'upi_qr' | 'cod_otp'
  const [sandboxOtp, setSandboxOtp] = useState('');
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [quickViewQuantity, setQuickViewQuantity] = useState(1);
  const [checkoutError, setCheckoutError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [simulationReceipt, setSimulationReceipt] = useState(null);

  /* ── order history (persisted per device in localStorage) ── */
  const [orderHistory, setOrderHistory] = useState(() => {
    try {
      const key = `reihh-orders-${getDeviceId()}`;
      return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem('reihh-order-history') || '[]');
    } catch {
      return [];
    }
  });

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
    localStorage.setItem('reihh-customer-info', JSON.stringify({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      whatsappUpdates: customer.whatsappUpdates,
    }));
  }, [customer.name, customer.phone, customer.address, customer.whatsappUpdates]);

  /* ── filter & sort products (Shopify-style) ── */
  const filteredProducts = useMemo(() => {
    let list = products.filter((product) => {
      if (category === 'Wishlist') return wishlist.includes(product.id);
      const matchesCategory = category === 'All pieces'
        || (category === 'New arrivals' ? product.collections?.includes('new-collections') : product.category === category);
      const matchesSearch = !query || `${product.title} ${product.category}`.toLowerCase().includes(query.toLowerCase());
      if (!matchesCategory || !matchesSearch) return false;

      const p = product.price || 0;
      if (priceFilter === 'under_5000' && p >= 5000) return false;
      if (priceFilter === '5000_10000' && (p < 5000 || p > 10000)) return false;
      if (priceFilter === 'above_10000' && p <= 10000) return false;
      return true;
    });

    if (sortBy === 'price_low') list.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortBy === 'price_high') list.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sortBy === 'title_asc') list.sort((a, b) => a.title.localeCompare(b.title));

    return list;
  }, [products, category, query, wishlist, priceFilter, sortBy]);

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
    setDrawerTab('bag');
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
      if (product) trackStoreEvent({ sessionId, eventType: 'wishlist_add', product, variant: product.variants[0] });
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

  const handleRazorpayPayment = async () => {
    setSubmitting(true);
    setCheckoutError('');
    try {
      // 1. Create order on backend
      const { data: orderData } = await client.post('/payments/razorpay/create-order', {
        amount: orderTotal,
        currency: 'INR',
        receipt: `rcpt_${sessionId.slice(0, 8)}`,
        notes: {
          customer_name: customer.name || 'Demo Customer',
          customer_email: customer.email || 'customer@reihh.com',
          phone: customer.phone || '+91 98765 43210',
        },
      });

      // 2. Ensure Razorpay Checkout script is loaded
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Razorpay payment gateway script'));
          document.body.appendChild(script);
        });
      }

      // 3. Open Razorpay options
      const options = {
        key: orderData.key_id || 'rzp_test_bizai_demo',
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'REIHH Fashion Studio',
        description: `Order Payment (${cart.length} pieces)`,
        order_id: orderData.id?.startsWith('order_test_') ? undefined : orderData.id,
        handler: async function (response) {
          try {
            setSubmitting(true);
            const { data } = await client.post('/payments/razorpay/verify', {
              razorpay_order_id: response.razorpay_order_id || orderData.id,
              razorpay_payment_id: response.razorpay_payment_id || `pay_${Date.now()}`,
              razorpay_signature: response.razorpay_signature || null,
              customer_name: customer.name || 'Demo Customer',
              customer_email: customer.email || 'customer@reihh.com',
              customer_phone: customer.phone || '+91 98765 43210',
              delivery_address: customer.address || '42 Connaught Place, New Delhi 110001',
              session_id: sessionId,
              discount_code: appliedDiscount?.code || null,
              items: cart.map((line) => ({ variant_id: line.variant.id, quantity: line.quantity })),
            });
            const receipt = data.simulation || data;
            setSimulationReceipt(receipt);
            setOrderHistory((prev) => {
              const updated = [receipt, ...prev];
              try {
                localStorage.setItem(`reihh-orders-${getDeviceId()}`, JSON.stringify(updated));
                sessionStorage.setItem('reihh-order-history', JSON.stringify(updated));
              } catch {}
              return updated;
            });
            setCart([]);
            setAppliedDiscount(null);
            setCheckoutStep(3);
          } catch (verifyErr) {
            setCheckoutError(apiError(verifyErr, 'Payment verification failed. Please try again.'));
          } finally {
            setSubmitting(false);
          }
        },
        prefill: {
          name: customer.name || 'Demo Customer',
          email: customer.email || 'customer@reihh.com',
          contact: customer.phone || '+91 98765 43210',
        },
        theme: {
          color: '#0e766e',
        },
        modal: {
          ondismiss: function () {
            setSubmitting(false);
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', function (resp) {
        setCheckoutError(`Payment unsuccessful: ${resp.error?.description || 'Transaction cancelled'}`);
        setSubmitting(false);
      });
      rzpInstance.open();
    } catch (err) {
      setCheckoutError(apiError(err, 'Could not initiate Razorpay payment.'));
      setSubmitting(false);
    }
  };

  const submitSimulation = async () => {
    setSubmitting(true);
    setCheckoutError('');
    try {
      const { data } = await client.post('/storefront/simulations', {
        customer_name: customer.name || 'Demo Customer',
        customer_email: customer.email,
        delivery_address: customer.address || '42 Connaught Place, New Delhi 110001',
        customer_phone: customer.phone || '+91 98765 43210',
        session_id: sessionId,
        discount_code: appliedDiscount?.code || null,
        payment_method: paymentMethod,
        items: cart.map((line) => ({ variant_id: line.variant.id, quantity: line.quantity })),
      });
      setSimulationReceipt(data);
      setOrderHistory((prev) => {
        const updated = [data, ...prev];
        try {
          localStorage.setItem(`reihh-orders-${getDeviceId()}`, JSON.stringify(updated));
          sessionStorage.setItem('reihh-order-history', JSON.stringify(updated));
        } catch {}
        return updated;
      });
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


  /* ── Orders Tab in Drawer ── */
  const renderOrdersTab = () => {
    if (orderHistory.length === 0) {
      return (
        <div className="cart-empty">
          <Clock size={28} />
          <strong>No orders placed this session.</strong>
          <span>Add items to your bag and simulate a checkout. Each device keeps its own order history.</span>
          <button className="store-hero-btn" style={{ marginTop: 14 }} onClick={() => { setDrawerTab('bag'); setCartOpen(false); }}>
            Browse Collection
          </button>
        </div>
      );
    }

    return (
      <div className="drawer-orders-content">
        <p className="drawer-orders-subtitle">
          Orders simulated from this device are synced with BizAI core with live Delhi fulfillment.
        </p>
        <div className="order-history-list">
          {orderHistory.map((order, idx) => (
            <div className="order-history-card expanded" key={order.reference || idx}>
              <div className="order-history-card-top">
                <div>
                  <span className="order-history-ref">{order.reference}</span>
                  <small style={{ display: 'block', color: 'var(--store-muted)', fontSize: 10, marginTop: 2 }}>
                    {order.customer_name || 'Demo Customer'}
                  </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="order-history-total">{money(order.total_amount)}</span>
                  {idx === 0 && <span className="order-history-latest-badge" style={{ marginLeft: 6 }}>Latest</span>}
                </div>
              </div>

              <div className="order-history-items-detailed">
                {order.items?.map((item, itemIdx) => (
                  <div className="receipt-line compact" key={item.variant_id || itemIdx}>
                    {item.image_url && <img src={item.image_url} alt="" />}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.variant_title || 'Default'} · Qty {item.quantity}</small>
                    </span>
                    <b>{money(item.line_total || ((item.unit_price || 0) * item.quantity))}</b>
                  </div>
                ))}
              </div>

              <div className="order-history-card-actions" style={{ marginTop: 8 }}>
                {order.delivery_token && (
                  <a
                    href={`/delivery/demo/${order.delivery_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="order-history-track-link primary"
                  >
                    <Truck size={12} /> Track Delivery (Rider POV) →
                  </a>
                )}
                {order.invoice_token && (
                  <a
                    href={`${(import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '')}/api/invoices/public/${order.invoice_token}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="order-history-track-link"
                  >
                    Invoice PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          className="store-continue-button"
          style={{ marginTop: 18 }}
          onClick={() => { setDrawerTab('bag'); setCartOpen(false); }}
        >
          Continue shopping
        </button>
      </div>
    );
  };

  /* ── Drawer content ── */
  const renderCartContent = () => {
    // Step 3: Confirmation + full order history
    if (checkoutStep === 3 && simulationReceipt) {
      const payLabel = paymentMethod === 'demo_card' ? 'Demo Card (Instant)' : paymentMethod === 'demo_upi' ? 'Demo UPI (Verified)' : 'Demo Cash on Delivery';
      return (
        <div className="order-confirmation">
          <div className="order-confirm-check"><Check size={32} /></div>
          <span className="store-kicker">Order confirmed &amp; simulated</span>
          <h3>{simulationReceipt.reference}</h3>
          <p className="order-confirm-sub">
            Payment via <strong>{payLabel}</strong>. Fulfillment: <strong>REIHH Delhi Central Warehouse</strong>.
          </p>
          <div className="order-confirm-delhivery-card" style={{ margin: '10px 0 14px', padding: '12px 14px', background: 'rgba(14, 118, 110, 0.07)', borderRadius: 8, border: '1px solid rgba(14, 118, 110, 0.22)', fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={14} style={{ color: 'var(--teal)' }} /> Delhivery Express Fulfillment
              </span>
              <span style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 600 }}>Dispatched</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--store-muted)', marginTop: 4 }}>
              <span>AWB Waybill: <strong style={{ color: 'var(--store-ink)' }}>#{simulationReceipt.tracking_number || '148392019482'}</strong></span>
              <a
                href={simulationReceipt.delhivery_url || `https://www.delhivery.com/track/package/${simulationReceipt.tracking_number || '148392019482'}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--teal)', textDecoration: 'underline', fontSize: 11 }}
              >
                Track on Delhivery.com ↗
              </a>
            </div>
          </div>

          {/* Latest order receipt */}
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
              className="store-whatsapp-btn"
              href={`https://wa.me/${(customer.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `🛍️ *REIHH Order Confirmed!*\n\n` +
                `Thank you ${customer.name || 'Customer'},\n` +
                `Your order *#${simulationReceipt.reference}* has been placed successfully.\n` +
                `Total: ₹${simulationReceipt.total_amount?.toLocaleString('en-IN')}\n\n` +
                `📍 Fulfillment: REIHH Delhi Warehouse\n` +
                `📦 Track Live Delivery (Delhi NCR):\n${window.location.origin}/delivery/demo/${simulationReceipt.delivery_token}\n\n` +
                `📄 Download Tax Invoice (PDF):\n${(import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '')}/api/invoices/public/${simulationReceipt.invoice_token}/pdf\n\n` +
                `REIHH Studio · Demo Store`
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={15} /> Send WhatsApp Order Updates →
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

          {/* Session order history */}
          {orderHistory.length > 1 && (
            <div className="order-history-section">
              <div className="order-history-heading">
                <Star size={13} />
                <span>All orders this session ({orderHistory.length})</span>
              </div>
              <div className="order-history-list">
                {orderHistory.map((order, idx) => (
                  <div className="order-history-card" key={order.reference}>
                    <div className="order-history-card-top">
                      <span className="order-history-ref">{order.reference}</span>
                      <span className="order-history-total">{money(order.total_amount)}</span>
                    </div>
                    <div className="order-history-items-preview">
                      {order.items?.slice(0, 3).map((item) => (
                        <span key={item.variant_id} className="order-history-item-chip">
                          {item.title} {item.variant_title ? `(${item.variant_title})` : ''} ×{item.quantity}
                        </span>
                      ))}
                      {order.items?.length > 3 && (
                        <span className="order-history-item-chip muted">+{order.items.length - 3} more</span>
                      )}
                    </div>
                    <div className="order-history-card-actions">
                      <a
                        href={`/delivery/demo/${order.delivery_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="order-history-track-link"
                      >
                        <Truck size={11} /> Track
                      </a>
                      {idx === 0 && <span className="order-history-latest-badge">Latest</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          <label className="simulation-customer-field">
            Phone number (WhatsApp Updates)
            <input
              required
              type="tel"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
            <small style={{ color: 'var(--store-muted)', fontSize: 10, marginTop: 4 }}>
              💬 Used to send real-time Delhi rider tracking and official tax invoices on WhatsApp.
            </small>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', margin: '6px 0 12px' }}>
            <input
              type="checkbox"
              checked={customer.whatsappUpdates}
              onChange={(e) => setCustomer({ ...customer, whatsappUpdates: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#25D366' }}
            />
            <span>Receive live delivery dispatch &amp; tax invoice on WhatsApp</span>
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

          {/* Three Payment Modes: Real Razorpay, Real Sandbox, Instant Demo */}
          <div className="payment-mode-tabs three-modes">
            <button
              type="button"
              className={`payment-mode-tab ${paymentMode === 'real_razorpay' ? 'active' : ''}`}
              onClick={() => { setPaymentMode('real_razorpay'); setPaymentMethod('razorpay'); }}
            >
              <strong>Real Gateway</strong>
              <small>Razorpay: UPI, Cards, NetBanking</small>
            </button>
            <button
              type="button"
              className={`payment-mode-tab ${paymentMode === 'real_demo' ? 'active' : ''}`}
              onClick={() => { setPaymentMode('real_demo'); setPaymentMethod('real_demo_gateway'); }}
            >
              <strong>Sandbox Demo</strong>
              <small>Interactive OTP &amp; QR modal</small>
            </button>
            <button
              type="button"
              className={`payment-mode-tab ${paymentMode === 'demo' ? 'active' : ''}`}
              onClick={() => { setPaymentMode('demo'); setPaymentMethod('demo_card'); }}
            >
              <strong>Instant Demo</strong>
              <small>1-click rapid simulation</small>
            </button>
          </div>

          {/* Mode 0: Real Razorpay Gateway */}
          {paymentMode === 'real_razorpay' && (
            <div className="demo-payment-options">
              <div className="razorpay-intro-box" style={{ padding: '14px 16px', background: 'rgba(14, 118, 110, 0.06)', borderRadius: 8, border: '1px solid rgba(14, 118, 110, 0.25)', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <ShieldCheck size={22} style={{ color: 'var(--teal)' }} />
                  <div>
                    <strong style={{ fontSize: 13, display: 'block' }}>Official Razorpay Gateway (India &amp; Global)</strong>
                    <small style={{ color: 'var(--store-muted)', fontSize: 11 }}>Accepts real and test payments securely</small>
                  </div>
                </div>
                <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 12, color: 'var(--store-muted)', lineHeight: 1.6 }}>
                  <li><strong>UPI:</strong> Google Pay, PhonePe, Paytm, BHIM, Scan any QR code.</li>
                  <li><strong>Cards:</strong> Visa, MasterCard, RuPay, Amex with bank OTP verification.</li>
                  <li><strong>NetBanking:</strong> HDFC, ICICI, SBI, Axis, and 50+ banks.</li>
                </ul>
                <small style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>
                  💡 Test credentials work out of the box. Add live keys in Settings to accept real card charges.
                </small>
              </div>

              <label className={`demo-payment-option ${paymentMethod === 'razorpay' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="razorpay"
                  checked={paymentMethod === 'razorpay'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <CreditCard size={18} />
                <div>
                  <strong>Pay via Razorpay (UPI, Cards, Wallets)</strong>
                  <small>Opens official popup modal with live &amp; test mode support</small>
                </div>
              </label>
            </div>
          )}

          {/* Mode 1: Instant Demo */}
          {paymentMode === 'demo' && (
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
                  <strong>Demo Visa / Mastercard (Instant)</strong>
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
                  <strong>Demo UPI (Instant)</strong>
                  <small>Simulated handle · Instant verification</small>
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
                  <small>Pay delivery rider upon arrival in Delhi NCR</small>
                </div>
              </label>
            </div>
          )}

          {/* Mode 2: Real Demo (Interactive Sandbox) */}
          {paymentMode === 'real_demo' && (
            <div className="demo-payment-options">
              <label className={`demo-payment-option ${paymentMethod === 'real_demo_gateway' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="real_demo_gateway"
                  checked={paymentMethod === 'real_demo_gateway'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <ShieldCheck size={18} />
                <div>
                  <strong>Card Gateway + 3D Secure OTP</strong>
                  <small>Interactive card form with SMS OTP challenge</small>
                </div>
              </label>

              <label className={`demo-payment-option ${paymentMethod === 'real_demo_upi_qr' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="real_demo_upi_qr"
                  checked={paymentMethod === 'real_demo_upi_qr'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <QrCode size={18} />
                <div>
                  <strong>Live Scannable Demo UPI QR</strong>
                  <small>Interactive QR code with simulated app approval</small>
                </div>
              </label>

              <label className={`demo-payment-option ${paymentMethod === 'real_demo_cod_otp' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="real_demo_cod_otp"
                  checked={paymentMethod === 'real_demo_cod_otp'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <DollarSign size={18} />
                <div>
                  <strong>Verified COD (Phone OTP Verification)</strong>
                  <small>Sends SMS OTP code to customer before dispatch</small>
                </div>
              </label>
            </div>
          )}

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
              onClick={() => {
                if (paymentMode === 'real_razorpay') {
                  handleRazorpayPayment();
                } else if (paymentMethod === 'real_demo_gateway') {
                  setSandboxModal('card_otp');
                  setSandboxOtp('');
                } else if (paymentMethod === 'real_demo_upi_qr') {
                  setSandboxModal('upi_qr');
                } else if (paymentMethod === 'real_demo_cod_otp') {
                  setSandboxModal('cod_otp');
                  setSandboxOtp('');
                } else {
                  submitSimulation();
                }
              }}
            >
              {submitting
                ? 'Processing…'
                : paymentMode === 'real_razorpay'
                  ? `Pay ${money(orderTotal)} with Razorpay`
                  : paymentMode === 'real_demo'
                    ? `Continue to Payment · ${money(orderTotal)}`
                    : `Place demo order · ${money(orderTotal)}`} {!submitting && <ArrowRight size={15} />}
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
        <button className="store-cart-button" onClick={() => { setDrawerTab('bag');
    setCartOpen(true); if (checkoutStep !== 0 && checkoutStep !== 3) setCheckoutStep(0); }}>
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

          {/* Shopify Polaris-style Secondary Toolbar: Price Filters & Sort */}
          <div className="store-secondary-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '14px 0 16px', padding: '10px 14px', background: 'var(--panel-bg, #fdfbf7)', borderRadius: 8, border: '1px solid var(--border, #eee)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--store-muted)', letterSpacing: '0.04em' }}>Price:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'under_5000', label: 'Under ₹5k' },
                { id: '5000_10000', label: '₹5k–₹10k' },
                { id: 'above_10000', label: '₹10k+' },
              ].map((pf) => (
                <button
                  key={pf.id}
                  type="button"
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 14,
                    border: priceFilter === pf.id ? '1px solid var(--teal)' : '1px solid var(--border, #ddd)',
                    background: priceFilter === pf.id ? 'var(--teal)' : 'transparent',
                    color: priceFilter === pf.id ? '#fff' : 'inherit',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPriceFilter(pf.id)}
                >
                  {pf.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="store-sort" style={{ fontSize: 12, color: 'var(--store-muted)' }}>Sort by:</label>
              <select
                id="store-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border, #ddd)', fontSize: 12, background: 'transparent' }}
              >
                <option value="featured">Featured / Best matches</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="title_asc">Name: A–Z</option>
              </select>
            </div>
          </div>

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
                    <div
                      className="store-product-image"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setQuickViewProduct(product);
                        setQuickViewQuantity(1);
                        trackStoreEvent({ sessionId, eventType: 'product_view', product, variant });
                      }}
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.title} loading="lazy" />
                      ) : (
                        <div className="product-placeholder">REIHH</div>
                      )}
                    </div>
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
                      <span
                        style={{ cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => {
                          setQuickViewProduct(product);
                          setQuickViewQuantity(1);
                          trackStoreEvent({ sessionId, eventType: 'product_view', product, variant });
                        }}
                      >
                        {product.title}
                      </span>
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
                  {drawerTab === 'orders' ? 'Session History' : checkoutStep === 0 ? 'Your Bag' : checkoutStep === 3 ? 'Confirmed' : 'Checkout'}
                </p>
                <h2>
                  {drawerTab === 'orders'
                    ? `My Orders (${orderHistory.length})`
                    : checkoutStep === 0
                      ? 'Review selection'
                      : checkoutStep === 3
                        ? 'Order confirmed'
                        : 'Customer & Payment'}
                  <small>
                    {drawerTab === 'orders'
                      ? `(${orderHistory.length} placed)`
                      : checkoutStep === 3
                        ? `(${simulationReceipt?.items?.length || 1} ${simulationReceipt?.items?.length === 1 ? 'item' : 'items'})`
                        : `(${lineCount} ${lineCount === 1 ? 'item' : 'items'})`}
                  </small>
                </h2>
              </div>
              <button onClick={() => setCartOpen(false)} aria-label="Close cart">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Navigation Tabs */}
            <div className="store-drawer-nav">
              <button
                type="button"
                className={`store-tab-btn ${drawerTab === 'bag' ? 'active' : ''}`}
                onClick={() => setDrawerTab('bag')}
              >
                <ShoppingBag size={13} /> Bag ({lineCount})
              </button>
              <button
                type="button"
                className={`store-tab-btn ${drawerTab === 'orders' ? 'active' : ''}`}
                onClick={() => setDrawerTab('orders')}
              >
                <Clock size={13} /> My Orders ({orderHistory.length})
              </button>
            </div>

            {drawerTab === 'orders' ? renderOrdersTab() : renderCartContent()}
          </aside>
        </div>
      )}
    
      {/* ── Interactive Sandbox Modals for Real Demo Payment ── */}
      {sandboxModal === 'card_otp' && (
        <div className="store-modal-backdrop" onClick={() => setSandboxModal(null)}>
          <div className="store-sandbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-modal-header">
              <ShieldCheck size={24} style={{ color: '#0e766e' }} />
              <div>
                <strong>3D Secure 2.0 Card Verification</strong>
                <small>Simulated Visa / Mastercard Sandbox</small>
              </div>
              <button className="sandbox-close-btn" onClick={() => setSandboxModal(null)}><X size={16} /></button>
            </div>
            <div className="sandbox-modal-body">
              <p>A simulated one-time password has been sent to customer phone <strong>{customer.phone || '+91 98765 43210'}</strong>.</p>
              <div className="sandbox-demo-hint">
                <span>Demo OTP:</span> <strong>123456</strong>
                <button type="button" onClick={() => setSandboxOtp('123456')}>Auto-fill</button>
              </div>
              <label className="simulation-customer-field" style={{ marginTop: 12 }}>
                Enter 6-digit OTP
                <input
                  type="text"
                  maxLength={6}
                  value={sandboxOtp}
                  onChange={(e) => setSandboxOtp(e.target.value)}
                  placeholder="123456"
                  autoFocus
                />
              </label>
              <div className="sandbox-modal-footer">
                <button className="store-continue-button" onClick={() => setSandboxModal(null)}>Cancel</button>
                <button
                  className="store-checkout-button"
                  disabled={sandboxOtp.trim().length < 4 || submitting}
                  onClick={() => {
                    setSandboxModal(null);
                    submitSimulation();
                  }}
                >
                  {submitting ? 'Verifying…' : `Authorize ${money(orderTotal)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sandboxModal === 'upi_qr' && (
        <div className="store-modal-backdrop" onClick={() => setSandboxModal(null)}>
          <div className="store-sandbox-modal upi-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-modal-header">
              <QrCode size={24} style={{ color: '#0e766e' }} />
              <div>
                <strong>Live Demo UPI QR Payment</strong>
                <small>Scan or simulate instant UPI approval</small>
              </div>
              <button className="sandbox-close-btn" onClick={() => setSandboxModal(null)}><X size={16} /></button>
            </div>
            <div className="sandbox-modal-body" style={{ textAlign: 'center' }}>
              <div className="demo-qr-box">
                {/* Simulated high-res UPI QR code using static QR API */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=reihh.studio@icici%26pn=REIHH%20Studio%26am=${orderTotal}%26cu=INR`}
                  alt="UPI QR Code"
                  style={{ width: 170, height: 170, borderRadius: 8 }}
                />
                <span className="demo-vpa">reihh.studio@icici</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--store-muted)', margin: '10px 0' }}>
                Open GPay, PhonePe, or Paytm and scan, or click below to simulate instant payment verification.
              </p>
              <div className="sandbox-modal-footer">
                <button className="store-continue-button" onClick={() => setSandboxModal(null)}>Cancel</button>
                <button
                  className="store-checkout-button"
                  disabled={submitting}
                  onClick={() => {
                    setSandboxModal(null);
                    submitSimulation();
                  }}
                >
                  {submitting ? 'Verifying…' : `Simulate UPI App Approval (${money(orderTotal)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sandboxModal === 'cod_otp' && (
        <div className="store-modal-backdrop" onClick={() => setSandboxModal(null)}>
          <div className="store-sandbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-modal-header">
              <DollarSign size={24} style={{ color: '#0e766e' }} />
              <div>
                <strong>Verify Phone for Cash on Delivery</strong>
                <small>Delhi NCR Courier Dispatch Verification</small>
              </div>
              <button className="sandbox-close-btn" onClick={() => setSandboxModal(null)}><X size={16} /></button>
            </div>
            <div className="sandbox-modal-body">
              <p>To prevent fake orders, please verify phone number <strong>{customer.phone || '+91 98765 43210'}</strong>.</p>
              <div className="sandbox-demo-hint">
                <span>Verification Code:</span> <strong>7890</strong>
                <button type="button" onClick={() => setSandboxOtp('7890')}>Auto-fill</button>
              </div>
              <label className="simulation-customer-field" style={{ marginTop: 12 }}>
                Enter 4-digit SMS Code
                <input
                  type="text"
                  maxLength={4}
                  value={sandboxOtp}
                  onChange={(e) => setSandboxOtp(e.target.value)}
                  placeholder="7890"
                  autoFocus
                />
              </label>
              <div className="sandbox-modal-footer">
                <button className="store-continue-button" onClick={() => setSandboxModal(null)}>Cancel</button>
                <button
                  className="store-checkout-button"
                  disabled={sandboxOtp.trim().length < 4 || submitting}
                  onClick={() => {
                    setSandboxModal(null);
                    submitSimulation();
                  }}
                >
                  {submitting ? 'Confirming…' : 'Verify & Confirm COD Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Quick-View Modal ── */}
      {quickViewProduct && (
        <div className="store-modal-backdrop" onClick={() => setQuickViewProduct(null)}>
          <div className="store-quick-view-modal" onClick={(e) => e.stopPropagation()}>
            <button className="quick-view-close" onClick={() => setQuickViewProduct(null)} aria-label="Close">
              <X size={18} />
            </button>
            <div className="quick-view-body">
              <div className="quick-view-image-pane">
                {quickViewProduct.image_url ? (
                  <img src={quickViewProduct.image_url} alt={quickViewProduct.title} />
                ) : (
                  <div className="product-placeholder">REIHH</div>
                )}
              </div>
              <div className="quick-view-info-pane">
                <span className="store-kicker">{quickViewProduct.category}</span>
                <h2>{quickViewProduct.title}</h2>
                <div className="quick-view-price-row">
                  <strong>{money(selectedVariant(quickViewProduct)?.price || quickViewProduct.price)}</strong>
                  <span className="quick-view-stock-tag">● In stock · Delhi dispatch</span>
                </div>

                <div className="quick-view-variants">
                  <span className="variant-label">Select Size / Variant:</span>
                  <div className="variant-chips">
                    {quickViewProduct.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`variant-chip ${selectedVariants[quickViewProduct.id] === v.id || (!selectedVariants[quickViewProduct.id] && v.id === quickViewProduct.variants[0]?.id) ? 'selected' : ''}`}
                        disabled={!v.available}
                        onClick={() => setSelectedVariants((prev) => ({ ...prev, [quickViewProduct.id]: v.id }))}
                      >
                        {v.options?.join(' / ') || v.title} {!v.available ? '(Sold out)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="quick-view-quantity">
                  <span className="variant-label">Quantity:</span>
                  <div className="cart-quantity">
                    <button type="button" onClick={() => setQuickViewQuantity((q) => Math.max(1, q - 1))}><Minus size={12} /></button>
                    <span>{quickViewQuantity}</span>
                    <button type="button" onClick={() => setQuickViewQuantity((q) => q + 1)}><Plus size={12} /></button>
                  </div>
                </div>

                <div className="quick-view-desc">
                  <p>
                    {quickViewProduct.description
                      ? quickViewProduct.description.replace(/<[^>]+>/g, '').slice(0, 240) + '…'
                      : 'Signature REIHH contemporary silhouette crafted with premium structured fabrics.'}
                  </p>
                </div>

                <div className="quick-view-actions">
                  <button
                    className="store-checkout-button"
                    onClick={() => {
                      const variant = selectedVariant(quickViewProduct);
                      trackStoreEvent({ sessionId, eventType: 'add_to_cart', product: quickViewProduct, variant, quantity: quickViewQuantity });
                      setCart((current) => {
                        const found = current.find((line) => line.variant.id === variant.id);
                        return found
                          ? current.map((line) => line.variant.id === variant.id ? { ...line, quantity: line.quantity + quickViewQuantity } : line)
                          : [...current, { product: quickViewProduct, variant, quantity: quickViewQuantity }];
                      });
                      setQuickViewProduct(null);
                      setDrawerTab('bag');
                      setCartOpen(true);
                    }}
                  >
                    + Add {quickViewQuantity} to Bag · {money((selectedVariant(quickViewProduct)?.price || quickViewProduct.price) * quickViewQuantity)}
                  </button>
                  <a
                    className="store-original-link"
                    href={quickViewProduct.product_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official piece on reihh.com ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}