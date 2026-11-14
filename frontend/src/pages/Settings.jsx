import { useEffect, useState } from 'react';
import { Check, ChevronRight, Moon, RotateCcw, Sparkles, Sun, Building2, Key, Eye, EyeOff, Save, CheckCircle2 } from 'lucide-react';
import client from '../api/client';
import { PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../utils/format';
import { useToast } from '../context/ToastContext';

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
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(localStorage.getItem('bizai-email-alerts') !== 'false');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scenario, setScenario] = useState('showcase');
  const [delay, setDelay] = useState('0');
  const [dark, setDark] = useState(() => localStorage.getItem('bizai-theme') === 'dark');

    // Business Profile & API Keys State
    const [companySettings, setCompanySettings] = useState({
      company_name: 'REIHH Studio',
      legal_name: 'Reihh Luxury Apparel Private Limited',
      company_gstin: '07AAACR1234F1Z5',
      company_address: 'Plot 42, Okhla Phase III, New Delhi 110020',
      support_email: 'contact@reihh.com',
      support_phone: '+91 98100 12345',
      logo_url: '',
      razorpay_key_id: '',
      razorpay_key_secret: '',
      delhivery_api_key: '',
      groq_api_key: '',
      gemini_api_key: '',
    });
    const [showKeys, setShowKeys] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsNotice, setSettingsNotice] = useState('');

    useEffect(() => {
      client.get('/integrations/settings')
        .then((res) => {
          if (res.data) {
            setCompanySettings((prev) => ({ ...prev, ...res.data }));
          }
        })
        .catch(() => { });
    }, []);

    const savePreferences = () => {
      localStorage.setItem('bizai-email-alerts', String(emailAlerts));
      setSaved(true);
      toast?.success('Preferences saved');
      window.setTimeout(() => setSaved(false), 1600);
    };

    const saveCompanySettings = async (e) => {
      e.preventDefault();
      setSavingSettings(true);
      setSettingsNotice('');
      try {
        await client.patch('/integrations/settings', companySettings);
        setSettingsNotice('Company profile and credentials saved securely.');
        toast?.success('Company profile & API keys saved');
        setTimeout(() => setSettingsNotice(''), 3000);
      } catch (err) {
        setError(apiError(err, 'Could not save company settings'));
        toast?.error('Could not save company settings');
      } finally {
        setSavingSettings(false);
      }
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
        setError(apiError(err, 'Could not reset workspace demo data'));
      } finally {
        setBusy(false);
      }
    };

    return (
    <>
            <PageHeader eyebrow="Workspace" title="Settings" subtitle="Legal entity configuration, payment gateways, courier API credentials, and preferences." />

            {settingsNotice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{settingsNotice}</div>}
            {error && <div className="notice error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
              {/* Left Column: Business Profile & Credentials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Business Profile Panel */}
                <section className="panel">
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, marginBottom: 4 }}>
                    <Building2 size={18} style={{ color: 'var(--teal)' }} /> Company Business Profile
                  </h2>
                  <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
                    Used on official GST Tax Invoices, Delhivery Shipping Slips, and P&amp;L Statements.
                  </p>

                  <form onSubmit={saveCompanySettings} className="stack-form">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <label>Brand Display Name
                        <input
                          value={companySettings.company_name || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, company_name: e.target.value })}
                          placeholder="e.g. REIHH Studio"
                        />
                      </label>
                      <label>Legal Registered Entity Name
                        <input
                          value={companySettings.legal_name || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, legal_name: e.target.value })}
                          placeholder="e.g. Reihh Luxury Apparel Pvt Ltd"
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <label>Registered GSTIN (India)
                        <input
                          value={companySettings.company_gstin || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, company_gstin: e.target.value.toUpperCase() })}
                          placeholder="e.g. 07AAACR1234F1Z5"
                        />
                      </label>
                      <label>Support Phone / WhatsApp
                        <input
                          value={companySettings.support_phone || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, support_phone: e.target.value })}
                          placeholder="+91 98100 12345"
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <label>Support Email Address
                        <input
                          type="email"
                          value={companySettings.support_email || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, support_email: e.target.value })}
                          placeholder="contact@reihh.com"
                        />
                      </label>
                      <label>Brand Logo URL
                        <input
                          type="url"
                          value={companySettings.logo_url || ''}
                          onChange={(e) => setCompanySettings({ ...companySettings, logo_url: e.target.value })}
                          placeholder="https://.../logo.png"
                        />
                      </label>
                    </div>

                    <label>Official Registered Address
                      <textarea
                        rows={2}
                        value={companySettings.company_address || ''}
                        onChange={(e) => setCompanySettings({ ...companySettings, company_address: e.target.value })}
                        placeholder="Street, Industrial Area, City, State, PIN"
                      />
                    </label>

                    {/* API Credentials Section */}
                    <div style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <strong style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Key size={15} style={{ color: 'var(--teal)' }} /> API Keys &amp; Gateway Credentials
                        </strong>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => setShowKeys(!showKeys)}
                          style={{ fontSize: 12 }}
                        >
                          {showKeys ? <><EyeOff size={13} /> Hide Keys</> : <><Eye size={13} /> Reveal Keys</>}
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <label>Razorpay Key ID
                          <input
                            type={showKeys ? 'text' : 'password'}
                            value={companySettings.razorpay_key_id || ''}
                            onChange={(e) => setCompanySettings({ ...companySettings, razorpay_key_id: e.target.value })}
                            placeholder="rzp_live_..."
                          />
                        </label>
                        <label>Razorpay Key Secret
                          <input
                            type={showKeys ? 'text' : 'password'}
                            value={companySettings.razorpay_key_secret || ''}
                            onChange={(e) => setCompanySettings({ ...companySettings, razorpay_key_secret: e.target.value })}
                            placeholder="Secret key"
                          />
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <label>Delhivery Logistics API Token
                          <input
                            type={showKeys ? 'text' : 'password'}
                            value={companySettings.delhivery_api_key || ''}
                            onChange={(e) => setCompanySettings({ ...companySettings, delhivery_api_key: e.target.value })}
                            placeholder="Delhivery bearer token"
                          />
                        </label>
                        <label>Gemini / Groq AI Key
                          <input
                            type={showKeys ? 'text' : 'password'}
                            value={companySettings.gemini_api_key || companySettings.groq_api_key || ''}
                            onChange={(e) => setCompanySettings({ ...companySettings, gemini_api_key: e.target.value })}
                            placeholder="AI API Key"
                          />
                        </label>
                      </div>
                    </div>

                    <button className="primary-btn" type="submit" disabled={savingSettings} style={{ marginTop: 10 }}>
                      <Save size={14} /> {savingSettings ? 'Saving Settings…' : 'Save Company Profile & Credentials'}
                    </button>
                  </form>
                </section>
              </div>

                    {/* Right Column: Appearance, Notifications, Demo Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <section className="panel setting-row">
                        <div>
                          <strong>Appearance</strong>
                          <small>Switch the workspace between light and dark mode.</small>
                        </div>
                        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
                          {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Dark' : 'Light'}
                        </button>
                      </section>

                        <section className="panel setting-row">
                          <div>
                            <strong>Notifications</strong>
                            <small>Show stock alerts in this workspace.</small>
                          </div>
                    <input
                      type="checkbox"
                      checked={emailAlerts}
                      onChange={(e) => setEmailAlerts(e.target.checked)}
                      aria-label="Enable notifications"
                    />
                  </section>

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

                  <button className="primary-btn save-settings" onClick={savePreferences}>
                    Save UI Preferences {saved && <Check size={16} />}
                  </button>
                </div>
      </div>
          </>
          );
}

          export default Settings;
