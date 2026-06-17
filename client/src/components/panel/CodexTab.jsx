import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';

export default function CodexTab({ workId }) {
  const navigate = useNavigate();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!workId) return;
    setLoading(true);
    api.get(`/works/${workId}/codex/flags`)
      .then((data) => {
        setFlags(Array.isArray(data) ? data.filter((f) => f.status === 'open') : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workId]);

  async function handleIgnore(flagId) {
    try {
      await api.put(`/works/${workId}/codex/flags/${flagId}`, { status: 'ignored' });
      setFlags((f) => f.filter((flag) => flag.id !== flagId));
    } catch (err) {
      console.error('Ignore flag failed:', err);
    }
  }

  if (loading) return <div className="panel-section"><p className="panel-loading">Loading flags…</p></div>;
  if (error) return <div className="panel-section"><p className="panel-error">{error}</p></div>;

  return (
    <div className="codex-tab">
      <p className="codex-tab-label">Unresolved Flags</p>

      {flags.length === 0 && (
        <p className="codex-tab-empty">No unresolved flags. Your story bible is clean.</p>
      )}

      {flags.map((flag) => (
        <div key={flag.id} className="codex-flag-card">
          <p className="codex-flag-text">{flag.description || flag.message}</p>
          {flag.entityName && (
            <p className="codex-flag-entity">Re: {flag.entityName}</p>
          )}
          <div className="codex-flag-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/work/${workId}/codex`)}
            >
              Resolve in Codex
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleIgnore(flag.id)}
            >
              Ignore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
