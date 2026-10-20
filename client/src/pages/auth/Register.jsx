import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { busyProps, guardBusy } from '../../utils/busyButton.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(name, email);
      navigate('/verify-otp', { state: { email, purpose: 'register' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={guardBusy(submitting, handleSubmit)}>
        <h1>Create an account</h1>
        <p>We'll email you a verification code to confirm your address.</p>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" {...busyProps(submitting)}>
          {submitting ? 'Sending…' : 'Register'}
        </button>
        <Link to="/login">Already have an account? Log in</Link>
      </form>
    </div>
  );
}
