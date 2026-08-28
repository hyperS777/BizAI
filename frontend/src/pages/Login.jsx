import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Box, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../utils/format';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@bizai.com', password: 'admin123' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !loading) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(apiError(err, 'Unable to sign in. Check that the API is running.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand-mark"><Box size={20} /> BIZAI</div>
        <div>
          <p className="eyebrow">Reihh business operations</p>
          <h1>Make every decision count.</h1>
          <p className="login-copy">Customers, stock, orders, invoices and AI insights in one workspace.</p>
        </div>
        <div className="login-stat">
          <span>Client</span>
          <strong>Amber Abbas · Sector 125, Mohali</strong>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="mobile-brand"><Box size={18} /> BIZAI</span>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Admin demo: admin@bizai.com / admin123</p>
          <label>Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required />
          </label>
          <label>Password
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ChevronRight size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
