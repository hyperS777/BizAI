import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError, formatDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  'Rent', 'Salaries', 'Utilities', 'Supplies', 'Marketing',
  'Transport', 'Maintenance', 'Software', 'Other',
];

const blank = { description: '', amount: '', category: '', date: new Date().toISOString().slice(0, 10) };

export default function Expenses() {
  const { can } = useAuth();
  const canEdit = can(['admin', 'manager', 'accountant']);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [deleting, setDeleting] = useState(null);

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

  const remove = async (id) => {
    try {
      await client.delete(`/expenses/${id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not delete expense'));
    }
  };

  const totalThisMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Expenses" subtitle="Track all business costs so profit is never overstated.">
        {canEdit && (
          <button className="primary-btn heading-btn" onClick={() => { setForm(blank); setModal(true); }}>
            Add expense
          </button>
        )}
      </PageHeader>

      {/* Summary strip */}
      <section className="metric-grid" style={{ marginBottom: 16 }}>
        <article className="metric coral">
          <span>This month</span>
          <strong>{money(totalThisMonth)}</strong>
          <small>{expenses.filter((e) => {
            const d = new Date(e.date);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length} entries</small>
        </article>
        <article className="metric">
          <span>All time</span>
          <strong>{money(expenses.reduce((s, e) => s + Number(e.amount), 0))}</strong>
          <small>{expenses.length} total entries</small>
        </article>
      </section>

      {error && <div className="notice error">{error}</div>}

      {expenses.length ? (
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
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td><strong>{expense.description}</strong></td>
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
        <EmptyState icon={Receipt} text="No expenses recorded yet. Add your first cost to track business profit accurately." />
      )}

      {modal && (
        <Modal title={form.id ? 'Edit expense' : 'Add expense'} onClose={() => { setModal(false); setForm(blank); }}>
          <form className="stack-form" onSubmit={save}>
            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Office rent for August"
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
    </>
  );
}
