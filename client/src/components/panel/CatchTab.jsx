import { useEffect } from 'react';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { api } from '../../utils/api.js';

export default function CatchTab({ workId }) {
  const { state, refreshCatches } = useActiveWork();

  useEffect(() => {
    if (workId) refreshCatches(workId);
  }, [workId, refreshCatches]);

  const openCatches = (state.catches || []).filter((c) => c.status === 'open');

  async function handleMarkUsed(catchId) {
    try {
      await api.put(`/works/${workId}/catches/${catchId}`, { status: 'used' });
      refreshCatches(workId);
    } catch (err) {
      console.error('Mark used failed:', err);
    }
  }

  async function handleDiscard(catchId) {
    try {
      await api.put(`/works/${workId}/catches/${catchId}`, { status: 'discarded' });
      refreshCatches(workId);
    } catch (err) {
      console.error('Discard failed:', err);
    }
  }

  return (
    <div className="catch-tab">
      <p className="catch-tab-label">Open Catches</p>

      {openCatches.length === 0 && (
        <p className="catch-tab-empty">No open catches. Press Ctrl+Shift+I to capture an idea.</p>
      )}

      {openCatches.map((c) => {
        const text = c.content || '';
        const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;

        return (
          <div key={c.id} className="catch-row">
            <p className="catch-row-text">{preview}</p>
            {c.taggedChapterId && (
              <span className="catch-row-chapter">→ {c.taggedChapterId}</span>
            )}
            <div className="catch-row-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleMarkUsed(c.id)}
              >
                Mark used
              </button>
              <button
                className="btn btn-ghost btn-sm danger"
                onClick={() => handleDiscard(c.id)}
              >
                Discard
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
