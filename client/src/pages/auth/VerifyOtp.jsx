import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function VerifyOtp() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const purpose = location.state?.purpose || 'register';
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp(email, code, purpose);
      navigate('/passkey-setup', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Enter verification code</h1>
        <p>Enter the 6-digit code you were given.</p>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Verifying…' : 'Verify'}
        </button>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}
