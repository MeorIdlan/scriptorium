import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      setStatus(me.scope === 'full' ? 'authenticated' : 'pending_passkey');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const register = useCallback((name, email) => api.post('/auth/register', { name, email }), []);
  const recover = useCallback((email) => api.post('/auth/recover', { email }), []);
  const verifyOtp = useCallback(
    async (email, code, purpose) => {
      await api.post('/auth/verify-otp', { email, code, purpose });
      await refresh();
    },
    [refresh]
  );
  const logout = useCallback(async () => {
    await api.post('/auth/logout', {});
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, register, recover, verifyOtp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
