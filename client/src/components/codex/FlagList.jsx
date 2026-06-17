import { api } from '../../utils/api.js';

export default function FlagList({ workId, flags, entityType, entityId, onFlagsChange }) {
  if (!flags || flags.length === 0) {
    return <p className="flags-empty">No flags for this entry.</p>;
  }

  async function handleAction(flagId, action) {
    try {
      await api.put(`/works/${workId}/codex/flags/${flagId}`, { status: action });
      onFlagsChange();
    } catch (err) {
      console.error('Flag action failed:', err);
    }
  }

  return (
    <div className="flag-list">
      <p className="flag-list-label">Flags</p>
      {flags.map((flag) => (
        <div key={flag.id} className="flag-item">
          <p className="flag-item-text">{flag.description || flag.message}</p>
          <div className="flag-item-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleAction(flag.id, 'canonical')}
            >
              Keep canonical
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleAction(flag.id, 'updated')}
            >
              Update Codex
            </button>
            <button
              className="btn btn-ghost btn-sm danger"
              onClick={() => handleAction(flag.id, 'ignored')}
            >
              Ignore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
