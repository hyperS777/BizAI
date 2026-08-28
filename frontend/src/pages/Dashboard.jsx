import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  CategoryScale, LinearScale, BarElement, Tooltip, Legend, Chart as ChartJS,
} from 'chart.js';
import { ChevronRight, CircleDollarSign, ClipboardList, Package, Search, Sparkles, UserPlus } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import client from '../api/client';
import { EmptyState, PageHeader } from '../components/ui';
import { formatDate, money } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [series, setSeries] = useState([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    Promise.all([
      client.get('/reports/dashboard'),
      client.get('/reports/sales?days=30'),
      client.get('/ai/summary'),
      client.get('/products/low-stock'),
    ])
      .then(([dashboard, sales, ai, stock]) => {
        setMetrics(dashboard.data);
        setSeries(sales.data.points || []);
        setSummary(ai.data.summary);
        setLowStock(stock.data || []);
      })
      .catch((err) => setError(err.response?.data?.detail || 'Could not load live business data.'));
  }, []);

  const sales = metrics?.sales_summary || {};
  const profit = metrics?.revenue_profit || {};
  const inventory = metrics?.inventory_summary || {};
  const recentOrders = metrics?.recent_orders || [];
  const chart = useMemo(() => ({
    labels: series.map((point) => formatDate(point.date).split(' ').slice(0, 2).join(' ')),
    datasets: [{
      label: 'Sales (₹)',
      data: series.map((point) => point.total),
      backgroundColor: '#75b9ac',
      borderRadius: 3,
    }],
  }), [series]);

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={`Good morning, ${user?.full_name?.split(' ')[0] || 'there'}.`}
        subtitle="Live pulse of customers, stock, orders and profit."
      >
        <button className="outline-btn" onClick={() => navigate('/reports')}><Search size={16} /> View reports</button>
      </PageHeader>

      {error && <div className="notice error">{error}</div>}

      <section className="metric-grid">
        <article className="metric teal"><span>Total sales</span><strong>{money(sales.total_sales)}</strong><small>{sales.total_orders || 0} orders</small></article>
        <article className="metric blue"><span>Revenue</span><strong>{money(profit.revenue)}</strong><small>{sales.total_customers || 0} customers</small></article>
        <article className="metric yellow"><span>Net profit</span><strong>{money(profit.profit)}</strong><small>After expenses {money(profit.expenses)}</small></article>
        <article className="metric coral"><span>Low-stock items</span><strong>{inventory.low_stock_products || 0}</strong><small>{inventory.total_products || 0} products tracked</small></article>
      </section>

      <section className="command-strip">
        <div className="command-intro"><span className="command-kicker">Workspace shortcuts</span><strong>Keep today moving</strong></div>
        <button type="button" onClick={() => navigate('/orders')}><span className="command-icon teal-bg"><ClipboardList size={16} /></span><span><strong>New order</strong><small>Record a sale</small></span><ChevronRight size={15} /></button>
        <button type="button" onClick={() => navigate('/customers')}><span className="command-icon blue-bg"><UserPlus size={16} /></span><span><strong>Add customer</strong><small>Grow your CRM</small></span><ChevronRight size={15} /></button>
      </section>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Performance</p>
              <h2>Sales last 30 days</h2>
            </div>
          </div>
          {series.some((point) => point.total > 0) ? (
            <div className="chart-wrap">
              <Bar data={chart} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false }} />
            </div>
          ) : (
            <EmptyState icon={CircleDollarSign} text="No sales data yet — orders will appear here automatically." />
          )}
        </section>
        <section className="panel assistant-card">
          <div className="assistant-icon"><Sparkles size={20} /></div>
          <p className="eyebrow">Business assistant</p>
          <h2>Your daily brief</h2>
          <p>{summary || 'Loading your grounded business summary…'}</p>
          <button className="text-btn" onClick={() => navigate('/ai')}>Ask AI assistant <ChevronRight size={16} /></button>
        </section>
      </div>

      <div className="dashboard-grid lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Operations</p><h2>Recent orders</h2></div>
            <button className="text-btn" onClick={() => navigate('/orders')}>See all</button>
          </div>
          {recentOrders.length ? (
            <div className="order-list">
              {recentOrders.slice(0, 5).map((order) => (
                <div className="order-row" key={order.id}>
                  <div>
                    <strong>#{order.order_number || order.id}</strong>
                    <small>{formatDate(order.created_at)}</small>
                  </div>
                  <span className={`status-pill ${order.status}`}>{order.status}</span>
                  <b>{money(order.total_amount)}</b>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={ClipboardList} text="No orders yet" />}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Inventory pulse</p><h2>Low stock items</h2></div>
            <button className="text-btn" onClick={() => navigate('/inventory')}>Review</button>
          </div>
          {lowStock.length ? (
            <div className="stock-list">
              {lowStock.slice(0, 4).map((item) => (
                <div className="stock-row" key={item.id}>
                  <span className="product-icon"><Package size={16} /></span>
                  <span><strong>{item.name}</strong><small>{item.stock_qty} units remaining</small></span>
                  <b>{item.min_stock_level} min</b>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Package} text="Your inventory is looking good" />}
        </section>
      </div>
    </>
  );
}
