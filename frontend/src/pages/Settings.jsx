import { useState } from 'react';
import { Check, ChevronRight, Moon, Sparkles, Sun, RotateCcw } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../utils/format';

export function Profile() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" subtitle="Signed-in workspace credentials." />
      <section className="profile-grid">
        <div className="panel profile-card">
          <div className="avatar large">{user?.full_name?.slice(0, 1) || 'A'}</div>
          <div>
            <h2>{user?.full_name || 'System Admin'}</h2>
            <p className="muted">{user?.email || 'admin@bizai.com'}</p>
            <span className="role-pill">{user?.role?.name || 'admin'}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export function Settings() {
  const { can } = useAuth();
  const [saved, setSaved] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(localStorage.getItem('bizai-email-alerts') !== 'false');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scenario, setScenario] = useState('showcase');
  const [delay, setDelay] = useState('0');
  const [dark, setDark] = useState(() => localStorage.getItem('bizai-theme') === 'dark');

  const save = () => {
    localStorage.setItem('bizai-email-alerts', String(emailAlerts));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bizai-theme', next ? 'dark' : 'light');
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  const simulate = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const addDemo = async () => {
        await client.post('/demo/simulate', { scenario });
        setMessage('Selected synthetic data added successfully.');
        setBusy(false);
      };
      if (Number(delay) > 0) {
        setMessage(`Scheduled to add in ${delay} seconds.`);
        window.setTimeout(addDemo, Number(delay) * 1000);
      } else {
        await addDemo();
      }
    } catch (err) {
      setError(apiError(err, 'Could not create demo data'));
    } finally {
      if (Number(delay) === 0) setBusy(false);
    }
  };

  const resetCleanData = async () => {
    if (!window.confirm('Reset workspace? This will clear test clutter and populate clean authentic REIHH apparel, customers, Delhivery orders, and expenses.')) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await client.post('/demo/reset-clean-data');
      setMessage('Workspace reset complete: Clean authentic REIHH catalog, orders, and expenses generated successfully.');
    } catch (err) {
      setError(apiError(err, 'Could not reset demo data'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Local preferences and presentation tools." />
      <section className="settings-grid">
        <div className="panel setting-row">
          <div>
            <strong>Appearance</strong>
            <small>Switch the workspace between light and dark mode.</small>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
            {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Dark' : 'Light'}
          </button>
        </div>
        <div className="panel setting-row">
          <div>
            <strong>Notifications</strong>
            <small>Show inventory alerts in this workspace.</small>
          </div>
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => setEmailAlerts(e.target.checked)}
            aria-label="Enable notifications"
          />
        </div>
        {can(['admin', 'manager']) && (
          <div className="panel simulator-panel">
            <div className="simulator-icon"><Sparkles size={24} /></div>
            <h2>Clean Demo Data</h2>
            <p className="muted">Wipe test clutter and refresh the workspace with clean authentic REIHH fashion records.</p>
            
            <button
              type="button"
              className="outline-btn"
              style={{ width: '100%', marginBottom: 14, justifyContent: 'center' }}
              onClick={resetCleanData}
              disabled={busy}
            >
              <RotateCcw size={15} /> Reset &amp; Populate Clean REIHH Data
            </button>

            <div className="demo-controls">
              <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                <option value="showcase">Full showcase</option>
                <option value="customer">Customer only</option>
                <option value="inventory">Low-stock alert</option>
                <option value="order">Order and invoice</option>
              </select>
              <select value={delay} onChange={(e) => setDelay(e.target.value)}>
                <option value="0">Add now</option>
                <option value="5">In 5 seconds</option>
                <option value="30">In 30 seconds</option>
              </select>
            </div>
            <button className="primary-btn simulator-button" onClick={simulate} disabled={busy}>
              {busy ? 'Processing…' : 'Add simulated entry'} <ChevronRight size={17} />
            </button>
            {message && <p className="success" style={{ marginTop: 10 }}>{message}</p>}
            {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
          </div>
        )}
      </section>
      <button className="primary-btn save-settings" onClick={save}>
        Save settings {saved && <Check size={16} />}
      </button>
    </>
  );
}
export default Settings;
