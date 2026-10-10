import { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { SUMMARY_STATUS_LABELS } from '../../utils/summaryStatus.js';

export default function ChapterSummaryModal({ workId, chapterId, onDismiss }) {
  const { state, refreshChapters } = useActiveWork();
  const chapter = state.chapters.find((c) => c.id === chapterId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'regenerate'
  const [error, setError] = useState(null);

  // The list's status is computed from saved text, so refresh on open
  useEffect(() => {
    refreshChapters(workId);
  }, [workId, refreshChapters]);

  const text = chapter?.summary?.text || '';
  const status = chapter?.summaryStatus || 'none';

  async function run(kind, request) {
    setBusy(kind);
    setError(null);
    try {
      await request();
      await refreshChapters(workId);
      setEditing(false);
    } catch (err) {
      setError(
        err.message === 'NO_API_KEY'
          ? 'No API key configured. Please go to Settings to add your API key.'
          : err.message
      );
    } finally {
      setBusy(null);
    }
  }

  const base = `/works/${workId}/chapters/${chapterId}/summary`;
  const handleSave = () => run('save', () => api.put(base, { text: draft }));
  const handleRegenerate = () => run('regenerate', () => api.post(`${base}/regenerate`, {}));

  return (
    <div
      className="modal-backdrop draft-polish-backdrop"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="modal chapter-summary-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Chapter Summary</h2>
            <p className="draft-polish-subtitle">
              AI help uses this to remember what happened in {chapter ? `“${chapter.title}”` : 'this chapter'}.
            </p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body">
          <p className={`summary-status summary-status--${status}`}>{SUMMARY_STATUS_LABELS[status]}</p>
          {editing ? (
            <textarea
              className="form-textarea chapter-summary-textarea"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          ) : (
            <p className="chapter-summary-text">{text || 'No summary yet. One is made the next time AI help needs this chapter, or generate it now.'}</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={handleRegenerate}
            disabled={Boolean(busy) || !chapter?.wordCount}
            title={chapter?.wordCount ? 'Replace with a fresh AI summary' : 'Write some of this chapter first'}
          >
            {busy === 'regenerate' ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
          <div className="modal-footer-right">
            {editing ? (
              <>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={Boolean(busy)}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDraft(text);
                  setEditing(true);
                }}
                disabled={Boolean(busy)}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
