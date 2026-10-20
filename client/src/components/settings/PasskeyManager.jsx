import { useEffect, useRef, useState, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../../utils/api.js';
import { busyProps, guardBusy } from '../../utils/busyButton.js';
import { useReturnFocus } from '../../hooks/useReturnFocus.js';
import { rowLeaveFocus } from '../../utils/rowLeave.js';

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const listRef = useRef(null);
  const addBtn = useRef(null);
  const returnFocus = useReturnFocus();

  // A refresh keeps the rows on screen, so focus in them survives it
  const fetchPasskeys = useCallback(async () => {
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

  async function handleDelete(id, index) {
    // The row leaves; focus goes to the next row's Remove, else the previous, else Add.
    // With one passkey left its Remove is disabled, so that case goes straight to Add.
    const leftAfter = passkeys.length - 1;
    returnFocus(rowLeaveFocus([...listRef.current.children], index, addBtn.current, (row) => (leftAfter > 1 ? row.querySelector('button') : null)));
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/auth/passkeys/${id}`);
      await fetchPasskeys();
    } catch (err) {
      setError(err.message);
      returnFocus(null);
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
        <ul className="passkey-list" ref={listRef}>
          {passkeys.map((p, index) => (
            <li key={p.id}>
              <span>{p.deviceLabel}</span>
              <span>{new Date(p.createdAt).toLocaleDateString()}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={guardBusy(busyId === p.id, () => handleDelete(p.id, index))}
                disabled={onlyOne}
                {...busyProps(busyId === p.id)}
                title={onlyOne ? "Can't remove your last passkey" : undefined}
              >
                {busyId === p.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button ref={addBtn} className="btn btn-secondary" onClick={guardBusy(adding, handleAdd)} {...busyProps(adding)}>
        {adding ? 'Waiting for device…' : 'Add a passkey'}
      </button>
    </section>
  );
}
