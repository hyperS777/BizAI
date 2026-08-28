import { useState } from 'react';
import { Check, ChevronRight, Moon, Sparkles, Sun } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { apiError } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export function Profile() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" subtitle="Your signed-in workspace identity." />
      <section className="panel profile-panel">
        <span className="avatar avatar-large">{user?.full_name?.slice(0, 1) || 'A'}</span>
        <div>
          <h2>{user?.full_name}</h2>
          <p className="muted">{user?.email}</p>
          <span className="status-pill confirmed">{user?.role?.name}</span>
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
    const next = !dark; setDark(next); localStorage.setItem('bizai-theme', next ? 'dark' : 'light'); document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  const simulate = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const addDemo = async () => { await client.post('/demo/simulate', { scenario }); setMessage('Selected synthetic data added successfully.'); setBusy(false); };
      if (Number(delay) > 0) { setMessage(`Scheduled to add in ${delay} seconds.`); window.setTimeout(addDemo, Number(delay) * 1000); } else await addDemo();
    } catch (err) {
      setError(apiError(err, 'Could not create demo data'));
    } finally {
      if (Number(delay) === 0) setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Local preferences and presentation tools." />
      <section className="settings-grid">
        <div className="panel setting-row"><div><strong>Appearance</strong><small>Switch the workspace between light and dark mode.</small></div><button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">{dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Dark' : 'Light'}</button></div>
        <div className="panel setting-row">
          <div><strong>Notifications</strong><small>Show inventory alerts in this workspace.</small></div>
          <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} aria-label="Enable notifications" />
        </div>
        {can(['admin', 'manager']) && (
          <div className="panel simulator-panel">
            <div className="simulator-icon"><Sparkles size={24} /></div>
            <h2>Demo data</h2>
            <p className="muted">Choose exactly what to add and when. Synthetic records never delete existing data.</p>
            <div className="demo-controls"><select value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="showcase">Full showcase</option><option value="customer">Customer only</option><option value="inventory">Low-stock alert</option><option value="order">Order and invoice</option></select><select value={delay} onChange={(e) => setDelay(e.target.value)}><option value="0">Add now</option><option value="5">In 5 seconds</option><option value="30">In 30 seconds</option></select></div>
            <button className="primary-btn simulator-button" onClick={simulate} disabled={busy}>{busy ? 'Creating…' : 'Add selected demo'} <ChevronRight size={17} /></button>
            {message && <p className="success">{message}</p>}
            {error && <p className="error">{error}</p>}
          </div>
        )}
      </section>
      <button className="primary-btn save-settings" onClick={save}>Save settings {saved && <Check size={16} />}</button>
    </>
  );
}
