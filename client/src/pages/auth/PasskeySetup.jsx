import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function PasskeySetup() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddPasskey() {
    setSubmitting(true);
    setError(null);
    try {
      const options = await api.post('/auth/passkey/options', {});
      const response = await startRegistration({ optionsJSON: options });
      await api.post('/auth/passkey/verify', { response, deviceLabel: navigator.platform || 'Passkey' });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Add a passkey</h1>
        <p>Register a passkey (Face ID, Touch ID, or a security key) to finish setting up your account.</p>
        {error && <div className="auth-error">{error}</div>}
        <button onClick={handleAddPasskey} disabled={submitting}>
          {submitting ? 'Waiting for device…' : 'Add passkey'}
        </button>
      </div>
    </div>
  );
}
