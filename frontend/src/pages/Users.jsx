import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export default function UsersPage() {
  const { can } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role_id: '' });

  const load = () => {
    client.get('/users').then((res) => setUsers(res.data || [])).catch((err) => setError(apiError(err)));
  };

  useEffect(() => {
    if (!can(['admin'])) return;
    load();
    client.get('/users/roles').then((res) => setRoles(res.data || []));
  }, []);

  if (!can(['admin'])) {
    return <EmptyState icon={UserRound} text="Only administrators can manage users." />;
  }

  const save = async (event) => {
    event.preventDefault();
    try {
      await client.post('/users', { ...form, role_id: Number(form.role_id) });
      setModal(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create user'));
    }
  };

  return (
    <>
      <PageHeader eyebrow="Access" title="Users" subtitle="Role-based accounts for admin, manager, employee and accountant.">
        <button className="primary-btn heading-btn" onClick={() => setModal(true)}>Add user</button>
      </PageHeader>
      {error && <div className="notice error">{error}</div>}
      <section className="panel table-panel">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>{user.role?.name}</td>
                <td>{user.is_active ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {modal && (
        <Modal title="Add user" onClose={() => setModal(false)}>
          <form className="stack-form" onSubmit={save}>
            <label>Full name<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <label>Role
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} required>
                <option value="">Select role</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <button className="primary-btn" type="submit">Create</button>
          </form>
        </Modal>
      )}
    </>
  );
}
