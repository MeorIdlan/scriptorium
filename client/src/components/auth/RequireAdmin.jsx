import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function RequireAdmin({ children }) {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}
