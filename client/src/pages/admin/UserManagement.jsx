import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { rowLeaveFocus } from '../../utils/rowLeave.js';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const tbody = useRef(null);
  const returnFocus = useReturnFocus();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.get('/admin/users'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const adminCount = users.filter((u) => u.isAdmin).length;

  async function handleDelete(u, index) {
    if (confirmingId !== u.id) {
      setConfirmingId(u.id);
      return;
    }
    // The row leaves: focus goes to the next row's enabled Delete, else the previous one
    returnFocus(rowLeaveFocus([...tbody.current.children], index, null, (row) => row.querySelector('button:not([disabled])')));
    setBusyId(u.id);
    setError(null);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(err.message);
      returnFocus(null);
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  function deleteDisabledReason(u) {
    if (u.id === currentUser?.id) return "You can't delete your own account.";
    if (u.isAdmin && adminCount <= 1) return 'Cannot delete the only admin account.';
    return undefined;
  }

  if (loading) {
    return <div className="loading-page"><p className="loading-text">Loading users…</p></div>;
  }

  return (
    <div className="settings-page admin-users-page">
      <div className="settings-header">
        <h1 className="settings-title">User Management</h1>
      </div>

      {error && <p className="error-text settings-error">{error}</p>}

      <table className="admin-users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Verified</th>
            <th>Admin</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody ref={tbody}>
          {users.map((u, index) => {
            const disabledReason = deleteDisabledReason(u);
            const isConfirming = confirmingId === u.id;
            return (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.emailVerified ? 'Yes' : 'No'}</td>
                <td>{u.isAdmin ? 'Admin' : ''}</td>
                <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</td>
                <td>
                  <button
                    className={isConfirming ? 'danger-confirm' : 'danger'}
                    disabled={!!disabledReason}
                    {...busyProps(busyId === u.id)}
                    title={disabledReason}
                    onClick={guardBusy(busyId === u.id, () => handleDelete(u, index))}
                  >
                    {busyId === u.id ? 'Deleting…' : isConfirming ? 'Confirm Delete?' : 'Delete'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
