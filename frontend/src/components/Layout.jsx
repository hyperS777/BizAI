import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Box, Check, ClipboardList, FileBarChart, LayoutDashboard, LogOut, Menu,
  Search, Settings, Sparkles, UserRound, Users, Warehouse, X, CircleDollarSign, Moon, Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Customers', to: '/customers', icon: Users },
  { label: 'Inventory', to: '/inventory', icon: Warehouse },
  { label: 'Orders', to: '/orders', icon: ClipboardList },
  { label: 'Invoices', to: '/invoices', icon: CircleDollarSign },
  { label: 'Reports', to: '/reports', icon: FileBarChart },
  { label: 'AI Assistant', to: '/ai', icon: Sparkles },
  { label: 'Users', to: '/users', icon: UserRound, roles: ['admin'] },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export default function Layout() {
  const { user, logout, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('bizai-theme') === 'dark');
  const navigate = useNavigate();
  const location = useLocation();

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bizai-theme', next ? 'dark' : 'light');
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  };

  const visibleNav = navItems.filter((item) => !item.roles || item.roles.includes(role));
  const currentPage = visibleNav.find((item) => item.to === location.pathname)?.label || 'Workspace';

  const search = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    navigate(`/customers?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="app-shell">
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <div className="brand-mark"><Box size={20} /> BIZAI</div>
        <button className="close-nav" onClick={() => setOpen(false)}><X size={20} /></button>
        <nav>
          {visibleNav.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={17} />
            <span><strong>AI insights</strong><small>Grounded in live data</small></span>
          </div>
          <button className="nav-item" onClick={() => { logout(); navigate('/login'); }}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}><Menu size={21} /></button>
          <form className="search" onSubmit={search}>
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers"
            />
          </form>
          <div className="current-page"><span>Workspace</span><strong>{currentPage}</strong></div>
          <div className="topbar-actions">
            <button className="icon-btn" aria-label={dark ? 'Use light mode' : 'Use dark mode'} onClick={toggleTheme}><>{dark ? <Sun size={19} /> : <Moon size={19} />}</></button>
            <button className="icon-btn" aria-label="Notifications" onClick={() => setNoticeOpen((v) => !v)}>
              <Bell size={19} /><i />
            </button>
            <button className="profile profile-button" onClick={() => navigate('/profile')}>
              <span className="avatar">{user?.full_name?.slice(0, 1) || 'A'}</span>
              <span className="profile-name">
                {user?.full_name || 'User'}
                <small>{user?.role?.name || 'Staff'}</small>
              </span>
            </button>
            <span className="live-status"><i /> Live</span>
            {noticeOpen && (
              <div className="notification-popover">
                <strong>Notifications</strong>
                <p><Check size={15} /> Low-stock alerts appear on Inventory and Dashboard.</p>
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
