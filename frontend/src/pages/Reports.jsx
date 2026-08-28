import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Chart as ChartJS,
} from 'chart.js';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export default function Reports() {
  const [metrics, setMetrics] = useState(null);
  const [series, setSeries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([client.get('/reports/dashboard'), client.get('/reports/sales?days=30')])
      .then(([dashboard, sales]) => {
        setMetrics(dashboard.data);
        setSeries(sales.data.points || []);
      })
      .catch((err) => setError(apiError(err)));
  }, []);

  const sales = metrics?.sales_summary || {};
  const profit = metrics?.revenue_profit || {};
  const top = metrics?.top_products || [];

  const bar = useMemo(() => ({
    labels: series.map((point) => point.date.slice(5)),
    datasets: [{ label: 'Daily sales', data: series.map((point) => point.total), backgroundColor: '#0e766e' }],
  }), [series]);

  const doughnut = useMemo(() => ({
    labels: top.map((item) => item.name),
    datasets: [{ data: top.map((item) => item.total_revenue), backgroundColor: ['#0e766e', '#507fa0', '#e8b84b', '#db775c', '#95a5a6'] }],
  }), [top]);

  return (
    <>
      <PageHeader eyebrow="Analytics" title="Reports" subtitle="Daily and monthly sales, profit, and best-selling products from live records." />
      {error && <div className="notice error">{error}</div>}
      <section className="metric-grid">
        <article className="metric"><span>Today</span><strong>{money(sales.daily_sales)}</strong><small>{sales.daily_orders || 0} orders</small></article>
        <article className="metric blue"><span>This month</span><strong>{money(sales.monthly_sales)}</strong><small>Last month {money(sales.previous_month_sales)}</small></article>
        <article className="metric yellow"><span>Profit</span><strong>{money(profit.profit)}</strong><small>Expenses {money(profit.expenses)}</small></article>
        <article className="metric coral"><span>Customers</span><strong>{sales.total_customers || 0}</strong><small>All-time orders {sales.total_orders || 0}</small></article>
      </section>
      <div className="dashboard-grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Daily sales</h2>
          <div className="chart-wrap"><Bar data={bar} options={{ plugins: { legend: { display: false } }, maintainAspectRatio: false }} /></div>
        </section>
        <section className="panel">
          <h2>Best sellers</h2>
          {top.length ? <div className="chart-wrap"><Doughnut data={doughnut} options={{ maintainAspectRatio: false }} /></div> : <p className="muted">Not enough sales yet.</p>}
        </section>
      </div>
    </>
  );
}
