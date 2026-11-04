import { useEffect, useMemo, useState } from 'react';
import { Receipt, TrendingDown, Calendar, RefreshCcw, Plus } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  'Rent', 'Salaries', 'Utilities', 'Supplies', 'Marketing',
  'Transport', 'Maintenance', 'Software', 'Other',
];

const blank = { description: '', amount: '', category: '', date: new Date().toISOString().slice(0, 10) };
const blankRecurring = {
  description: '',
  amount: '',
  category: '',
  start_date: new Date().toISOString().slice(0, 10),
  frequency: 'monthly',
  months: 12,
};

export default function Expenses() {
  const { can } = useAuth();
  const canEdit = can(['admin', 'manager', 'accountant']);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [recurringModal, setRecurringModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [recurringForm, setRecurringForm] = useState(blankRecurring);
  const [deleting, setDeleting] = useState(null);
  const [filterMonth, setFilterMonth] = useState('all');
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringSuccess, setRecurringSuccess] = useState('');

  const load = () => {
    client.get('/expenses')
      .then((res) => setExpenses(res.data || []))
      .catch((err) => setError(apiError(err)));
  };

  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (form.id) await client.put(`/expenses/${form.id}`, payload);
      else await client.post('/expenses', payload);
      setModal(false);
      setForm(blank);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save expense'));
    }
  };

  const saveRecurring = async (event) => {
    event.preventDefault();
    setRecurringBusy(true);
    setRecurringSuccess('');
    try {
      const { data } = await client.post('/expenses/bulk', {
        ...recurringForm,
        amount: Number(recurringForm.amount),
        months: Number(recurringForm.months),
      });
      setRecurringSuccess(`Created ${data.length} ${recurringForm.frequency} expense entries.`);
      setRecurringForm(blankRecurring);
      load();
      setTimeout(() => { setRecurringModal(false); setRecurringSuccess(''); }, 2000);
    } catch (err) {
      setError(apiError(err, 'Could not create recurring expenses'));
    } finally {
      setRecurringBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await client.delete(`/expenses/${id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not delete expense'));
    }
  };

  /* ── Derived stats ── */
  const now = new Date();
  const thisMonth = expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalThisMonth = thisMonth.reduce((s, e) => s + Number(e.amount), 0);
  const totalAllTime = expenses.reduce((s, e) => s + Number(e.amount), 0);

  /* Annual view: group by year+month */
  const monthlyTotals = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + Number(e.amount);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [expenses]);

  const monthOptions = [
    { value: 'all', label: 'All time' },
    ...monthlyTotals.map(([key]) => {
      const [yr, mo] = key.split('-');
      const label = new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      return { value: key, label };
    }),
  ];

  const filteredExpenses = filterMonth === 'all'
    ? expenses
    : expenses.filter((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === filterMonth;
    });

  return (
    <>
      <PageHeader eyebrow="Finance" title="Expenses" subtitle="Track all business costs so profit is never overstated.">
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="outline-btn heading-btn" onClick={() => { setRecurringForm(blankRecurring); setRecurringModal(true); }}>
              <RefreshCcw size={14} /> Recurring
            </button>
            <button className="primary-btn heading-btn" onClick={() => { setForm(blank); setModal(true); }}>
              <Plus size={14} /> Add expense
            </button>
          </div>
        )}
      </PageHeader>

      {/* Summary strip */}
      <section className="metric-grid" style={{ marginBottom: 16 }}>
        <article className="metric coral">
          <span>This month</span>
          <strong>{money(totalThisMonth)}</strong>
          <small>{thisMonth.length} entries</small>
        </article>
        <article className="metric">
          <span>All time</span>
          <strong>{money(totalAllTime)}</strong>
          <small>{expenses.length} total entries</small>
        </article>
        {monthlyTotals.length > 1 && (
          <article className="metric">
            <span>Avg per month</span>
            <strong>{money(totalAllTime / monthlyTotals.length)}</strong>
            <small>over {monthlyTotals.length} months</small>
          </article>
        )}
      </section>

      {/* Monthly bar chart */}
      {monthlyTotals.length > 1 && (
        <section className="panel expense-chart-panel" style={{ marginBottom: 16 }}>
          <div className="expense-chart-heading">
            <TrendingDown size={16} /> Monthly spend
          </div>
          <div className="expense-chart-bars">
            {monthlyTotals.slice(0, 6).reverse().map(([key, total]) => {
              const [yr, mo] = key.split('-');
              const label = new Date(Number(yr), Number(mo) - 1).toLocaleString('en-IN', { month: 'short' });
              const pct = Math.max(4, Math.round((total / (monthlyTotals[0][1] || 1)) * 100));
              return (
                <div className="expense-bar-group" key={key}>
                  <div className="expense-bar-wrap">
                    <div className="expense-bar" style={{ height: `${pct}%` }} title={money(total)} />
                  </div>
                  <small>{label}</small>
                  <span>{money(total)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter */}
      {canEdit && (
        <div className="expenses-filter-row">
          <Calendar size={14} />
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            {monthOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <span className="muted">{filteredExpenses.length} entries · {money(filteredExpenses.reduce((s, e) => s + Number(e.amount), 0))}</span>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      {filteredExpenses.length ? (
        <section className="panel table-panel expense-table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <strong>{expense.description}</strong>
                    {expense.notes && <small style={{ display: 'block', color: 'var(--muted)' }}>{expense.notes}</small>}
                  </td>
                  <td>
                    <span className="status-pill">{expense.category || 'Other'}</span>
                  </td>
                  <td><b style={{ color: 'var(--coral)' }}>{money(expense.amount)}</b></td>
                  <td>{formatDate(expense.date)}</td>
                  {canEdit && (
                    <td className="row-actions">
                      <button
                        className="text-btn"
                        onClick={() => { setForm({ ...expense, date: expense.date?.slice(0, 10) }); setModal(true); }}
                      >
                        Edit
                      </button>
                      {deleting === expense.id ? (
                        <>
                          <button className="text-btn danger" onClick={() => remove(expense.id)}>Confirm</button>
                          <button className="text-btn" onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="text-btn danger" onClick={() => setDeleting(expense.id)}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState icon={Receipt} text={filterMonth !== 'all' ? 'No expenses in this period.' : 'No expenses recorded yet. Add your first cost to track business profit accurately.'} />
      )}

      {/* Add / Edit expense modal */}
      {modal && (
        <Modal title={form.id ? 'Edit expense' : 'Add expense'} onClose={() => { setModal(false); setForm(blank); }}>
          <form className="stack-form" onSubmit={save}>
            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Office rent for November"
                required
              />
            </label>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label>
              Amount (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </label>
            <button className="primary-btn" type="submit">
              {form.id ? 'Update expense' : 'Add expense'}
            </button>
          </form>
        </Modal>
      )}

      {/* Recurring expense modal */}
      {recurringModal && (
        <Modal title="Add recurring expense" onClose={() => { setRecurringModal(false); setRecurringSuccess(''); }}>
          <form className="stack-form" onSubmit={saveRecurring}>
            <p className="modal-hint">
              <RefreshCcw size={14} /> Creates one expense entry per month (or year), auto-labelled with the period.
            </p>
            <label>
              Description
              <input
                value={recurringForm.description}
                onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
                placeholder="e.g. Office rent"
                required
              />
            </label>
            <label>
              Category
              <select
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label>
              Amount per period (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                required
              />
            </label>
            <label>
              Starting from
              <input
                type="date"
                value={recurringForm.start_date}
                onChange={(e) => setRecurringForm({ ...recurringForm, start_date: e.target.value })}
                required
              />
            </label>
            <label>
              Frequency
              <select
                value={recurringForm.frequency}
                onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })}
              >
                <option value="monthly">Monthly (1 entry/month)</option>
                <option value="annual">Annual (1 entry/year)</option>
              </select>
            </label>
            <label>
              Number of periods
              <input
                type="number"
                min="1"
                max={recurringForm.frequency === 'annual' ? 10 : 36}
                value={recurringForm.months}
                onChange={(e) => setRecurringForm({ ...recurringForm, months: e.target.value })}
                required
              />
              <small>
                Will create {recurringForm.months} entries totalling {money(Number(recurringForm.amount || 0) * Number(recurringForm.months || 0))}
              </small>
            </label>
            {recurringSuccess && <p className="notice success">{recurringSuccess}</p>}
            <button className="primary-btn" type="submit" disabled={recurringBusy}>
              {recurringBusy ? 'Creating…' : `Create ${recurringForm.months} entries`}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
