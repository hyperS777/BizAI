import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, Check, Minus, Plus, Search, ShoppingBag, X } from 'lucide-react';
import client from '../api/client';
import { apiError, money } from '../utils/format';
import './Storefront.css';

const collections = ['All pieces', 'New arrivals', 'Menswear', 'Womenswear'];

export default function Storefront() {
  const location = useLocation();
  const isSimulation = location.pathname === '/store/demo';
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All pieces');
  const [query, setQuery] = useState('');
  const [selectedVariants, setSelectedVariants] = useState({});
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [simulationReceipt, setSimulationReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    client.get('/storefront/products')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => setError('The REIHH collection is temporarily unavailable. Please visit reihh.com to shop.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All pieces'
      || (category === 'New arrivals' ? product.collections?.includes('new-collections') : product.category === category);
    const matchesSearch = !query || `${product.title} ${product.category}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [products, category, query]);

  const lineCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);

  const selectedVariant = (product) => {
    const currentId = selectedVariants[product.id];
    return product.variants.find((variant) => variant.id === currentId)
      || product.variants.find((variant) => variant.available)
      || product.variants[0];
  };

  const addToCart = (product) => {
    const variant = selectedVariant(product);
    if (!variant?.available) return;
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

  const goToCheckout = async () => {
    if (!cart.length) return;
    if (isSimulation) {
      setSubmitting(true);
      setCheckoutError('');
      try {
        const { data } = await client.post('/storefront/simulations', {
          customer_name: customer.name,
          customer_email: customer.email,
          items: cart.map((line) => ({ variant_id: line.variant.id, quantity: line.quantity })),
        });
        setSimulationReceipt(data);
        setCart([]);
      } catch (err) {
        setCheckoutError(apiError(err, 'Could not record this simulation. Please retry.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const items = cart.map((line) => `${line.variant.id}:${line.quantity}`).join(',');
    window.location.assign(`https://reihh.com/cart/${items}`);
  };

  return (
    <div className="storefront">
      <div className="store-announcement">{isSimulation ? 'DEMO ONLY · No payment will be taken' : 'Complimentary domestic shipping'} <span>•</span> {isSimulation ? 'Test orders are kept separate' : 'Flexible payment at checkout'} <a href={isSimulation ? '/store' : '/store/demo'}>{isSimulation ? 'Live store' : 'Customer demo'}</a></div>
      <header className="store-header">
        <a className="store-wordmark" href="https://reihh.com/" aria-label="REIHH home">REIHH<span>®</span></a>
        <nav className="store-links" aria-label="Store collections">
          <a href="https://reihh.com/collections/menswear">Menswear</a>
          <a href="https://reihh.com/collections/womenswear">Womenswear</a>
          <a href="https://reihh.com/collections/new-collections">New collections</a>
          <a href="https://reihh.com/collections/best-sellers">Best sellers</a>
        </nav>
        <button className="store-cart-button" onClick={() => setCartOpen(true)} aria-label={`Open shopping bag, ${lineCount} items`}>
          <ShoppingBag size={19} /><span>Bag</span><b>{lineCount}</b>
        </button>
      </header>

      <main className="store-main">
        <section className="store-intro">
          <p className="store-kicker">{isSimulation ? 'Customer checkout simulation' : 'REIHH · Spring / Summer 26'}</p>
          <h1>{isSimulation ? <>Try the<br />REIHH journey.</> : <>Pieces with<br />presence.</>}</h1>
          <p className="store-intro-copy">{isSimulation ? 'Try the REIHH customer journey with live products and options. This preview never places or charges a real order.' : 'Modern silhouettes, considered details, and expressive everyday dressing.'}</p>
          <a className="store-original-link" href={isSimulation ? '/store' : 'https://reihh.com/collections/all'}>{isSimulation ? 'Switch to live REIHH checkout' : 'Visit the original REIHH store'} <ArrowRight size={15} /></a>
        </section>

        <section className="store-catalog" aria-label="REIHH product catalog">
          <div className="catalog-heading">
            <div><span className="store-kicker">{isSimulation ? 'Preview products' : 'The collection'}</span><h2>{isSimulation ? 'Build a test bag' : 'Shop the edit'} <small>{filteredProducts.length}</small></h2></div>
            <label className="store-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces" aria-label="Search products" /></label>
          </div>
          <div className="store-filter" role="tablist" aria-label="Filter collections">
            {collections.map((item) => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          {error && <div className="store-message">{error}</div>}
          {loading ? <div className="store-message">Loading the REIHH collection…</div> : null}
          {!loading && !error && filteredProducts.length === 0 && <div className="store-message">No pieces match this search.</div>}
          <div className="store-product-grid">
            {filteredProducts.map((product) => {
              const variant = selectedVariant(product);
              const optionLabels = [...new Set(product.variants.flatMap((item) => item.options || []))];
              return (
                <article className="store-product" key={product.id}>
                  <a className="store-product-image" href={product.product_url} target="_blank" rel="noreferrer">
                    {product.image_url ? <img src={product.image_url} alt={product.title} loading="lazy" /> : <span>REIHH</span>}
                    {!variant?.available && <i>Sold out</i>}
                  </a>
                  <div className="store-product-info">
                    <div className="store-product-title"><a href={product.product_url} target="_blank" rel="noreferrer">{product.title}</a><span>{money(product.price)}</span></div>
                    <small>{product.category}</small>
                    {product.variants.length > 1 && (
                      <label className="store-variant-select"><span>{variant?.title || optionLabels.join(' / ') || 'Select option'}</span>
                        <select value={variant?.id || ''} onChange={(event) => setSelectedVariants({ ...selectedVariants, [product.id]: event.target.value })} aria-label={`Choose ${optionLabels.join(' and ') || 'variant'} for ${product.title}`}>
                          {product.variants.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.title}{item.available ? '' : ' · sold out'}</option>)}
                        </select>
                      </label>
                    )}
                    <button className="store-add-button" disabled={!variant?.available} onClick={() => addToCart(product)}>{variant?.available ? 'Add to bag' : 'Sold out'} <Plus size={15} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="store-footer"><a href="https://reihh.com/pages/returns-exchanges">Returns & exchanges</a><a href="https://reihh.com/pages/shipping">Shipping</a><a href={isSimulation ? '/store' : '/store/demo'}>{isSimulation ? 'Live storefront' : 'Customer preview'}</a><span>{isSimulation ? 'Simulation records never create payments or live orders.' : 'Checkout and payment are securely completed on REIHH.'}</span></footer>

      {cartOpen && <div className="store-cart-backdrop" onClick={() => setCartOpen(false)} role="presentation">
        <aside className="store-cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Shopping bag">
          <div className="cart-heading"><div><span className="store-kicker">Your selection</span><h2>Shopping bag <small>{lineCount}</small></h2></div><button onClick={() => setCartOpen(false)} aria-label="Close shopping bag"><X size={21} /></button></div>
          {simulationReceipt ? <div className="simulation-receipt"><Check size={25} /><span className="store-kicker">Simulation recorded</span><h3>{simulationReceipt.reference}</h3><p>This is a test transaction only. No payment was taken and no live Shopify order was created.</p><strong>{money(simulationReceipt.total_amount)}</strong><button className="store-checkout-button" onClick={() => { setSimulationReceipt(null); setCartOpen(false); }}>Continue browsing</button></div> : cart.length === 0 ? <div className="cart-empty"><ShoppingBag size={24} /><strong>Your bag is waiting.</strong><span>Explore the collection and add a piece.</span></div> : <>
            <div className="cart-lines">{cart.map(({ product, variant, quantity }) => <article className="cart-line" key={variant.id}>
              {product.image_url && <img src={product.image_url} alt="" />}
              <div className="cart-line-body"><strong>{product.title}</strong><small>{variant.title}</small><span>{money(variant.price)}</span><div className="cart-quantity"><button onClick={() => changeQuantity(variant.id, -1)} aria-label={`Remove one ${product.title}`}><Minus size={13} /></button><span>{quantity}</span><button onClick={() => changeQuantity(variant.id, 1)} aria-label={`Add one ${product.title}`}><Plus size={13} /></button></div></div>
              <button className="cart-remove" onClick={() => setCart((current) => current.filter((line) => line.variant.id !== variant.id))} aria-label={`Remove ${product.title}`}><X size={15} /></button>
            </article>)}</div>
            <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              {isSimulation ? <>
                <label className="simulation-customer-field">Customer name<input required autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
                <label className="simulation-customer-field">Email<input required type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
                {checkoutError && <p className="simulation-error">{checkoutError}</p>}
                <button className="store-checkout-button" disabled={submitting || !customer.name || !customer.email} onClick={goToCheckout}>{submitting ? 'Recording simulation…' : 'Simulate customer order'} <ArrowRight size={16} /></button>
                <p><Check size={14} /> Test record only; does not update stock, revenue, or Shopify</p>
              </> : <>
                <small>Shipping, taxes, and payment options are calculated by REIHH checkout.</small>
                <button className="store-checkout-button" onClick={goToCheckout}>Continue to REIHH checkout <ArrowRight size={16} /></button>
                <p><Check size={14} /> Secure checkout and payment on reihh.com</p>
              </>}
            </div>
          </>}
        </aside>
      </div>}
    </div>
  );
}
