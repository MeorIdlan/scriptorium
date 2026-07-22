import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { refresh, recover } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e) {
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

  async function handleRecover(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await recover(email);
      navigate('/verify-otp', { state: { email, purpose: 'recovery' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'recover') {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleRecover}>
          <h1>Recover access</h1>
          <p>We'll email a verification code to your own address so you can register a new passkey.</p>
          {error && <div className="auth-error">{error}</div>}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send recovery code'}
          </button>
          <button type="button" onClick={() => { setMode('login'); setError(null); }}>
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
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
        <button type="button" onClick={() => { setMode('recover'); setError(null); }}>
          Lost your passkey? Recover access
        </button>
      </form>
    </div>
  );
}
