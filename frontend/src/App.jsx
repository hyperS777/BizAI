import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import Invoices from './pages/Invoices';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import AIAssistant from './pages/AIAssistant';
import UsersPage from './pages/Users';
import { Profile, Settings } from './pages/Settings';
import Integrations from './pages/Integrations';

function RequireRoles({ roles, children }) {
  const { role } = useAuth();
  return roles.includes(role) ? children : <Navigate to="/" replace />;
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading workspace…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:customerId" element={<CustomerDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/invoices" element={<RequireRoles roles={['admin', 'manager', 'accountant']}><Invoices /></RequireRoles>} />
          <Route path="/expenses" element={<RequireRoles roles={['admin', 'manager', 'accountant']}><Expenses /></RequireRoles>} />
          <Route path="/reports" element={<RequireRoles roles={['admin', 'manager', 'accountant']}><Reports /></RequireRoles>} />
          <Route path="/ai" element={<RequireRoles roles={['admin', 'manager', 'accountant']}><AIAssistant /></RequireRoles>} />
          <Route path="/users" element={<RequireRoles roles={['admin']}><UsersPage /></RequireRoles>} />
          <Route path="/integrations" element={<RequireRoles roles={['admin', 'manager']}><Integrations /></RequireRoles>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
