import { useEffect, useState, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../../utils/api.js';

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    setLoading(true);
    try {
      setPasskeys(await api.get('/auth/passkeys'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const options = await api.post('/auth/passkey/options', {});
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/auth/passkey/verify', { response, deviceLabel: navigator.platform || 'Passkey' });
      await fetchPasskeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/auth/passkeys/${id}`);
      await fetchPasskeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const onlyOne = passkeys.length <= 1;

  return (
    <section className="settings-section">
      <h2>Passkeys</h2>
      {error && <div className="auth-error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="passkey-list">
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>{p.deviceLabel}</span>
              <span>{new Date(p.createdAt).toLocaleDateString()}</span>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={onlyOne || busyId === p.id}
                title={onlyOne ? "Can't remove your last passkey" : undefined}
              >
                {busyId === p.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={handleAdd} disabled={adding}>
        {adding ? 'Waiting for device…' : 'Add a passkey'}
      </button>
    </section>
  );
}
