import { useEffect, useState } from 'react';
import { UserRound, Plus, Edit3, KeyRound, UserX, UserCheck, Shield } from 'lucide-react';
import client from '../api/client';
import { EmptyState, Modal, PageHeader } from '../components/ui';
import { apiError } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function UsersPage() {
  const { can, user: currentUser } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [passwordModal, setPasswordModal] = useState(null);

  const [createForm, setCreateForm] = useState({ email: '', full_name: '', password: '', role_id: '' });
  const [editForm, setEditForm] = useState({ email: '', full_name: '', role_id: '', is_active: true });
  const [newPassword, setNewPassword] = useState('');

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

    const handleCreate = async (event) => {
      event.preventDefault();
      try {
        await client.post('/users', { ...createForm, role_id: Number(createForm.role_id) });
        setCreateModal(false);
        setCreateForm({ email: '', full_name: '', password: '', role_id: '' });
        setNotice('User account created successfully.');
        toast?.success(`Team member ${createForm.full_name || createForm.email} created`);
        load();
      } catch (err) {
        setError(apiError(err, 'Could not create user'));
        toast?.error(apiError(err, 'Could not create user'));
      }
    };

    const openEdit = (u) => {
      setEditModal(u);
      setEditForm({
        email: u.email,
        full_name: u.full_name,
        role_id: u.role_id || u.role?.id,
        is_active: u.is_active,
      });
    };

    const handleUpdate = async (event) => {
      event.preventDefault();
      try {
        await client.put(`/users/${editModal.id}`, {
          ...editForm,
          role_id: Number(editForm.role_id),
        });
        setEditModal(null);
        setNotice(`User account ${editForm.full_name} updated.`);
        toast?.success(`Updated ${editForm.full_name}`);
        load();
      } catch (err) {
        setError(apiError(err, 'Could not update user'));
        toast?.error('Could not update user');
      }
    };

    const handleResetPassword = async (event) => {
      event.preventDefault();
      try {
        await client.post(`/users/${passwordModal.id}/reset-password`, { password: newPassword });
        setPasswordModal(null);
        setNewPassword('');
        setNotice(`Password reset successfully for ${passwordModal.email}.`);
        toast?.success(`Password reset for ${passwordModal.email}`);
      } catch (err) {
        setError(apiError(err, 'Could not reset password'));
        toast?.error('Could not reset password');
      }
    };

    const toggleUserActive = async (u) => {
      if (u.id === currentUser?.id) {
        alert('You cannot deactivate your own admin account.');
        return;
      }
      try {
        await client.delete(`/users/${u.id}`);
        setNotice(`User account ${u.full_name} ${u.is_active ? 'deactivated' : 'activated'}.`);
        toast?.info(`${u.full_name} ${u.is_active ? 'deactivated' : 'activated'}`);
        load();
      } catch (err) {
        setError(apiError(err, 'Could not change account status'));
        toast?.error('Could not change account status');
      }
    };

    return (
    <>
          <PageHeader eyebrow="Access" title="Users &amp; Team Roles" subtitle="Manage accounts for administrators, showroom managers, employees, and accountants.">
            <button className="primary-btn heading-btn" onClick={() => setCreateModal(true)}>
              <Plus size={14} /> Add user
            </button>
          </PageHeader>

          {notice && <div className="notice success" style={{ background: '#eaf4f1', borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}>{notice}</div>}
          {error && <div className="notice error">{error}</div>}

          <section className="panel table-panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.full_name}</strong>
                          {u.id === currentUser?.id && (
                            <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 10, marginLeft: 6 }}>
                              You
                            </span>
                          )}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <span className="role-pill" style={{ textTransform: 'capitalize' }}>
                            {u.role?.name || 'Staff'}
                          </span>
                        </td>
                        <td>
                          {u.is_active ? (
                            <span className="status-pill paid">Active</span>
                          ) : (
                            <span className="status-pill cancelled">Disabled</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button className="text-btn" onClick={() => openEdit(u)} title="Edit user details">
                              Edit
                            </button>
                            <button
                              className="text-btn"
                              onClick={() => { setPasswordModal(u); setNewPassword(''); }}
                              title="Reset user password"
                            >
                              <KeyRound size={13} />
                            </button>
                            {u.id !== currentUser?.id && (
                              <button
                                className={`text-btn ${u.is_active ? 'danger' : ''}`}
                                onClick={() => toggleUserActive(u)}
                                title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                              >
                                {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
        </table>
          </section>

                    {/* Add User Modal */}
                    {createModal && (
                      <Modal title="Create Team User Account" onClose={() => setCreateModal(false)}>
                        <form className="stack-form" onSubmit={handleCreate}>
                          <label>Full name*
                            <input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="e.g. Rohini Sen" required />
                          </label>
                          <label>Email Address*
                            <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="rohini@reihh.com" required />
                          </label>
                          <label>Temporary Password*
                            <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Minimum 6 characters" required />
                          </label>
                          <label>Role Privilege*
                            <select value={createForm.role_id} onChange={(e) => setCreateForm({ ...createForm, role_id: e.target.value })} required>
                              <option value="">Select permission role</option>
                              {roles.map((role) => <option key={role.id} value={role.id}>{role.name} — {role.description}</option>)}
                            </select>
                          </label>
                          <button className="primary-btn" type="submit">Create User Account</button>
                        </form>
                      </Modal>
                    )}

                    {/* Edit User Modal */}
                    {editModal && (
                      <Modal title={`Edit User · ${editModal.full_name}`} onClose={() => setEditModal(null)}>
                        <form className="stack-form" onSubmit={handleUpdate}>
                          <label>Full name*
                            <input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} required />
                          </label>
                          <label>Email Address*
                            <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
                          </label>
                          <label>Role Privilege*
                            <select value={editForm.role_id} onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })} required>
                              {roles.map((role) => <option key={role.id} value={role.id}>{role.name} — {role.description}</option>)}
                            </select>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <input
                              type="checkbox"
                              checked={editForm.is_active}
                              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                            />
                            <span>Account Active (Allowed to sign in)</span>
                          </label>
                          <button className="primary-btn" type="submit">Save Changes</button>
                        </form>
                      </Modal>
                    )}

                    {/* Reset Password Modal */}
                    {passwordModal && (
                      <Modal title={`Reset Password · ${passwordModal.full_name}`} onClose={() => setPasswordModal(null)}>
                        <form className="stack-form" onSubmit={handleResetPassword}>
                          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                            Enter a new secure password for <strong>{passwordModal.email}</strong>.
                          </p>
                          <label>New Password*
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="At least 6 characters"
                              required
                            />
                          </label>
                          <button className="primary-btn" type="submit" disabled={newPassword.length < 6}>
                            Update Password
                          </button>
                        </form>
                      </Modal>
                    )}
                  </>
                  );
}
