import { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useEditor } from '../../context/EditorContext.jsx';
import { formatNumber } from '../../utils/wordCount.js';

export default function DraftHistoryModal({ workId, chapterId, onDismiss }) {
  const { replaceContent } = useEditor();
  const [history, setHistory] = useState(null);
  const [selected, setSelected] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/works/${workId}/chapters/${chapterId}`)
      .then((chapter) => {
        const entries = [...(chapter.draftHistory || [])].reverse();
        setHistory(entries);
        setSelected(entries[0] || null);
      })
      .catch((err) => setError(err.message));
  }, [workId, chapterId]);

  async function handleRestore() {
    if (!selected) return;
    setRestoring(true);
    setError(null);
    try {
      const chapter = await api.post(`/works/${workId}/chapters/${chapterId}/restore`, {
        savedAt: selected.savedAt,
      });
      replaceContent(chapter.content || '', chapter.contentHtml || '');
      onDismiss();
    } catch (err) {
      setError(err.message);
      setRestoring(false);
    }
  }

  return (
    <div
      className="modal-backdrop draft-polish-backdrop"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="modal draft-polish-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Draft History</h2>
            <p className="draft-polish-subtitle">
              A snapshot is kept at most every 10 minutes while you write. Restoring keeps your current text as a snapshot too.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body draft-history-body">
          {!history && !error && <p className="panel-loading">Loading history…</p>}
          {history && history.length === 0 && (
            <p className="draft-history-empty">No snapshots yet. They appear as you keep writing.</p>
          )}
          {history && history.length > 0 && (
            <>
              <ul className="draft-history-list">
                {history.map((entry) => (
                  <li key={entry.savedAt}>
                    <button
                      className={`draft-history-item${selected?.savedAt === entry.savedAt ? ' active' : ''}`}
                      onClick={() => setSelected(entry)}
                    >
                      <span className="draft-history-time">{new Date(entry.savedAt).toLocaleString()}</span>
                      <span className="draft-history-words">{formatNumber(entry.wordCount || 0)} words</span>
                    </button>
                  </li>
                ))}
              </ul>
              <pre className="draft-polish-preview draft-history-preview">
                {selected?.contentSnapshot || '(empty)'}
              </pre>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onDismiss}>Close</button>
          <button className="btn btn-primary" onClick={handleRestore} disabled={!selected || restoring}>
            {restoring ? 'Restoring…' : 'Restore this version'}
          </button>
        </div>
      </div>
    </div>
  );
}
