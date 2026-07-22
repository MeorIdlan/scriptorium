import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { challengeId, options } = await api.post('/auth/login/options', { email });
      const response = await startAuthentication({ optionsJSON: options });
      await api.post('/auth/login/verify', { challengeId, response });
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
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Log in</h1>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Waiting for device…' : 'Log in with passkey'}
        </button>
        <Link to="/register">Need access? Request registration</Link>
      </form>
    </div>
  );
}
