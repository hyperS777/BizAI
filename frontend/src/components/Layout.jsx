import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, Check, CircleDollarSign, ClipboardList, FileBarChart,
  LayoutDashboard, LogOut, Menu, Moon, Package, Receipt, Search, Settings,
  ShoppingBag, Sparkles, Sun, UserRound, Users, Warehouse, X, ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import CommandPalette from './CommandPalette';

const navGroups = [
  {
    title: 'Core Operations',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Orders', to: '/orders', icon: ClipboardList },
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Inventory', to: '/inventory', icon: Warehouse },
      { label: 'Customers', to: '/customers', icon: Users },
    ],
  },
  {
    title: 'Co-Pilot AI',
    items: [
      { label: 'AI Advisor', to: '/ai', icon: Sparkles, roles: ['admin', 'manager', 'accountant'] },
    ],
  },
  {
    title: 'Finances & P&L',
    items: [
      { label: 'Invoices', to: '/invoices', icon: CircleDollarSign, roles: ['admin', 'manager', 'accountant'] },
      { label: 'Expenses', to: '/expenses', icon: Receipt, roles: ['admin', 'manager', 'accountant'] },
      { label: 'Reports', to: '/reports', icon: FileBarChart, roles: ['admin', 'manager', 'accountant'] },
    ],
  },
  {
    title: 'Channels & Settings',
    items: [
      { label: 'Online Store', to: '/store', icon: ShoppingBag },
      { label: 'Integrations', to: '/integrations', icon: Settings, roles: ['admin', 'manager'] },
      { label: 'Settings', to: '/settings', icon: Settings },
      { label: 'Users & Roles', to: '/users', icon: UserRound, roles: ['admin'] },
    ],
  },
];

export default function Layout() {
  const { user, logout, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('bizai-theme') === 'dark');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (dark) document.documentElement.dataset.theme = 'dark';
    else document.documentElement.dataset.theme = 'light';
  }, [dark]);

  useEffect(() => {
    client.get('/notifications')
      .then((res) => setNotifications(res.data?.items || []))
      .catch(() => { });
    const interval = setInterval(() => {
      client.get('/notifications')
        .then((res) => setNotifications(res.data?.items || []))
        .catch(() => { });
    }, 120_000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bizai-theme', next ? 'dark' : 'light');
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const allNavItems = navGroups.flatMap((g) => g.items);
  const currentPage = allNavItems.find((item) => item.to === location.pathname)?.label || 'Workspace';
  const unreadCount = notifications.length;

  return (
    <div className="app-shell">
      <CommandPalette
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
        onToggleTheme={toggleTheme}
        dark={dark}
      />

      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <div className="brand-header">
          <div className="brand-mark">
            <img src="/reihh-logo.png" alt="REIHH" className="reihh-brand-logo" />
            <span className="brand-sub-badge">HQ</span>
          </div>
          <button className="close-nav" onClick={() => setOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <nav className="shopify-nav">
          {navGroups.map((group) => {
            const filteredItems = group.items.filter((item) => !item.roles || item.roles.includes(role));
            if (!filteredItems.length) return null;
            return (
              <div key={group.title} className="nav-group-section">
                <div className="nav-group-title">{group.title}</div>
                {filteredItems.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={17} className="nav-icon" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-sync-pill">
            <span className="sync-pulse-dot" />
            <div className="sync-info">
              <span className="sync-title">REIHH Live Sync</span>
              <span className="sync-desc">Catalog · Stock · Logistics</span>
            </div>
          </div>
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{role || 'Staff'}</span>
            <span>· {user?.full_name?.split(' ')[0] || 'User'}</span>
          </div>
          <button className="nav-item signout-btn" onClick={() => { logout(); navigate('/login'); }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}><Menu size={21} /></button>

          <div
            className="search shopify-spotlight-trigger"
            onClick={() => setCommandOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCommandOpen(true); }}
          >
            <Search size={16} className="spotlight-search-icon" />
            <span className="spotlight-placeholder">Search products, orders, customers…</span>
            <kbd className="spotlight-kbd">⌘K</kbd>
          </div>

          <div className="current-page">
            <span>Workspace</span>
            <strong>{currentPage}</strong>
          </div>

          <div className="topbar-actions">
            <a
              href="/store"
              target="_blank"
              rel="noopener noreferrer"
              className="storefront-quick-link"
              title="Open customer storefront in new tab"
            >
              <ExternalLink size={14} />
              <span>Storefront</span>
            </a>

            <button className="icon-btn" aria-label={dark ? 'Use light mode' : 'Use dark mode'} onClick={toggleTheme}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              className="icon-btn"
              aria-label={`Notifications${unreadCount ? ` (${unreadCount})` : ''}`}
              onClick={() => setNoticeOpen((v) => !v)}
            >
              <Bell size={18} />
              {unreadCount > 0 && <i className="notif-badge-dot" />}
            </button>

            <button className="profile profile-button" onClick={() => navigate('/profile')}>
              <span className="avatar">{user?.full_name?.slice(0, 1) || 'A'}</span>
              <span className="profile-name">
                {user?.full_name || 'System Admin'}
                <small>{user?.role?.name || role || 'Admin'}</small>
              </span>
            </button>

            <span className="live-status"><i /> Live</span>

            {noticeOpen && (
              <div className="notification-popover">
                <strong>Notifications {unreadCount > 0 && <span style={{ color: 'var(--coral)', fontSize: 12 }}>({unreadCount})</span>}</strong>
                {notifications.length === 0 ? (
                  <p><Check size={15} /> All systems normal — no alerts right now.</p>
                ) : (
                  <div className="notif-list">
                    {notifications.slice(0, 6).map((n) => (
                      <div key={n.id} className="notif-item" onClick={() => { setNoticeOpen(false); navigate(n.link); }}>
                        <AlertTriangle size={15} style={{ color: n.severity === 'error' ? 'var(--coral)' : 'var(--yellow)', flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong style={{ fontSize: 13 }}>{n.title}</strong>
                          <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, marginTop: 2 }}>{n.message}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="text-btn" onClick={() => { setNoticeOpen(false); navigate('/inventory'); }}>
                  Review inventory
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
