import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement,
  Tooltip, Legend, Chart as ChartJS, Filler,
} from 'chart.js';
import { Download, TrendingUp, Users, Package, FileText, Calendar, Filter } from 'lucide-react';
import client, { downloadPnlPdf, downloadGstr1Csv } from '../api/client';
import { EmptyState, PageHeader } from '../components/ui';
import { apiError, money } from '../utils/format';
import { useToast } from '../context/ToastContext';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Tooltip, Legend, Filler,
);

const PALETTE = ['#0e766e', '#507fa0', '#e8b84b', '#db775c', '#95a5a6', '#8e44ad', '#16a085'];

const RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
];

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [metrics, setMetrics] = useState(null);
  const [series, setSeries] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const salesUrl = useCustomDates
      ? `/reports/sales?start_date=${startDate}&end_date=${endDate}`
      : `/reports/sales?days=${days}`;

    Promise.all([
      client.get('/reports/dashboard'),
      client.get(salesUrl),
      client.get('/reports/top-products?limit=7'),
      client.get('/reports/customer-activity?limit=8'),
      client.get('/reports/expenses-summary', {
        params: useCustomDates ? { start_date: startDate, end_date: endDate } : undefined,
      }),
    ])
      .then(([dashboard, salesRes, topRes, custRes, expRes]) => {
        setMetrics(dashboard.data);
        setSeries(salesRes.data.points || []);
        setTopProducts(topRes.data || []);
        setCustomers(custRes.data || []);
        setExpenses(expRes.data);
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
}, [days, useCustomDates, startDate, endDate]);

const sales = metrics?.sales_summary || {};
const profit = metrics?.revenue_profit || {};

const barChart = useMemo(() => ({
  labels: series.map((p) => p.date.slice(5)),
  datasets: [{
    label: 'Sales (₹)',
    data: series.map((p) => p.total),
    backgroundColor: 'rgba(14,118,110,0.15)',
    borderColor: '#0e766e',
    borderWidth: 2,
    fill: true,
    tension: 0.4,
    pointRadius: 2,
  }],
}), [series]);

const doughnut = useMemo(() => ({
  labels: topProducts.map((p) => p.name),
  datasets: [{
    data: topProducts.map((p) => p.total_revenue),
    backgroundColor: PALETTE,
    borderWidth: 0,
  }],
}), [topProducts]);

const expenseBar = useMemo(() => {
  const cats = expenses?.by_category || [];
  return {
    labels: cats.map((c) => c.category),
    datasets: [{
      label: 'Expenses (₹)',
      data: cats.map((c) => c.total),
      backgroundColor: PALETTE.map((c) => c + 'cc'),
      borderRadius: 4,
    }],
  };
}, [expenses]);

const chartOpts = {
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true } },
  responsive: true,
  maintainAspectRatio: false,
};

return (
  <>
    <PageHeader
      eyebrow="Analytics"
      title="Reports &amp; Financials"
      subtitle="Sales, manufacturing costs (COGS), P&amp;L statements, GSTR-1 tax filings, and margins."
    >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="outline-btn heading-btn"
            onClick={() => downloadPnlPdf('profit-and-loss-statement.pdf')}
            title="Download formal P&L statement PDF"
          >
            <FileText size={14} /> Download P&amp;L (PDF)
          </button>
          <button
            className="outline-btn heading-btn"
            onClick={() => downloadGstr1Csv('GSTR1-Tax-Report.csv')}
            title="Download GSTR-1 tax compliance CSV"
          >
            <Download size={14} /> Export GSTR-1 (CSV)
          </button>
        </div>
    </PageHeader>

    {/* Date Range Selection Toolbar */}
    <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={useCustomDates ? 'custom' : days}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setUseCustomDates(true);
            } else {
              setUseCustomDates(false);
              setDays(Number(e.target.value));
            }
          }}
          style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', padding: '7px 12px', borderRadius: 6, fontSize: 13 }}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>{o.label}</option>
          ))}
          <option value="custom">Custom Date Range…</option>
        </select>

        {useCustomDates && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12 }}
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12 }}
            />
          </div>
        )}
      </div>
  </div >

    { error && <div className="notice error">{error}</div>}

{/* KPI Row */ }
<section className="metric-grid">
  <article className="metric teal">
    <span>Total sales</span>
    <strong>{money(sales.total_sales)}</strong>
    <small>{sales.total_orders || 0} all-time orders</small>
  </article>
  <article className="metric blue">
    <span>This month</span>
    <strong>{money(sales.monthly_sales)}</strong>
    <small>Last month {money(sales.previous_month_sales)}</small>
  </article>
  <article className="metric yellow">
    <span>Net profit</span>
    <strong>{money(profit.profit)}</strong>
    <small>Expenses {money(profit.expenses)}</small>
  </article>
  <article className="metric">
    <span>Today</span>
    <strong>{money(sales.daily_sales)}</strong>
    <small>{sales.daily_orders || 0} orders today</small>
  </article>
</section>

{/* Sales trend + Top products */ }
<div className="dashboard-grid" style={{ marginTop: 16 }}>
  <section className="panel">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Sales trend</p>
        <h2>Daily sales · last {days} days</h2>
      </div>
      <button
        className="outline-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => exportCSV(series, `sales-${days}d.csv`)}
      >
        <Download size={14} /> CSV
      </button>
    </div>
    {series.some((p) => p.total > 0) ? (
      <div className="chart-wrap">
        <Line data={barChart} options={chartOpts} />
      </div>
    ) : (
      <EmptyState icon={TrendingUp} text="No sales in this period." />
    )}
  </section>

  <section className="panel">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Products</p>
        <h2>Top sellers by revenue</h2>
      </div>
      <button
        className="outline-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => exportCSV(topProducts, 'top-products.csv')}
      >
        <Download size={14} /> CSV
      </button>
    </div>
    {topProducts.length ? (
      <div className="chart-wrap">
        <Doughnut
          data={doughnut}
          options={{
            plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } },
            responsive: true,
            maintainAspectRatio: false,
          }}
        />
      </div>
    ) : (
      <EmptyState icon={Package} text="Not enough order history yet." />
    )}
  </section>
</div>

{/* Expenses by category */ }
<div className="dashboard-grid lower-grid" style={{ marginTop: 14 }}>
  <section className="panel">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Finance</p>
        <h2>Expenses by category</h2>
      </div>
      <button
        className="outline-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => exportCSV(expenses?.by_category || [], 'expenses-by-category.csv')}
      >
        <Download size={14} /> CSV
      </button>
    </div>
    {expenses?.by_category?.length ? (
      <div className="chart-wrap">
        <Bar data={expenseBar} options={chartOpts} />
      </div>
    ) : (
      <EmptyState icon={TrendingUp} text="No expenses recorded yet." />
    )}
    {expenses && (
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
        Total expenses (all time): <strong style={{ color: 'var(--coral)' }}>{money(expenses.total)}</strong>
      </p>
    )}
  </section>

  {/* Top customers */}
  <section className="panel">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Customers</p>
        <h2>Top by spending</h2>
      </div>
      <button
        className="outline-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => exportCSV(customers, 'top-customers.csv')}
      >
        <Download size={14} /> CSV
      </button>
    </div>
    {customers.length ? (
      <div className="stock-list">
        {customers.slice(0, 8).map((c, i) => (
          <div className="stock-row" key={c.customer_id} style={{ gap: 10 }}>
            <span
              style={{
                width: 26, height: 26, background: PALETTE[i % PALETTE.length] + '22',
                color: PALETTE[i % PALETTE.length], borderRadius: 4, display: 'grid',
                placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1, display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 13 }}>{c.name}</strong>
              <small style={{ color: 'var(--muted)', fontSize: 11 }}>{c.order_count} orders</small>
            </span>
            <b style={{ fontFamily: "'Space Grotesk'", fontSize: 13 }}>{money(c.total_spent)}</b>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState icon={Users} text="No customer activity yet." />
    )}
  </section>
</div>

{/* Top products table */ }
{
  topProducts.length > 0 && (
    <section className="panel table-panel" style={{ marginTop: 14 }}>
      <div className="panel-heading" style={{ padding: '18px 22px 0' }}>
        <div>
          <p className="eyebrow">Detail</p>
          <h2>Best-selling products</h2>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>SKU</th>
            <th>Units sold</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {topProducts.map((p, i) => (
            <tr key={p.product_id}>
              <td style={{ color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</td>
              <td><strong>{p.name}</strong></td>
              <td style={{ color: 'var(--muted)' }}>{p.sku}</td>
              <td>{p.total_quantity}</td>
              <td><b>{money(p.total_revenue)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
    </>
  );
}
