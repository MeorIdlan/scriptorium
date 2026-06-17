const MODE_LABELS = {
  full: 'Editorial Read-through',
  'show-tell': 'Show, Don\'t Tell',
  voice: 'Voice & Consistency',
};

const FLAG_ICONS = {
  full: '◆',
  'show-tell': '◈',
  voice: '◇',
};

export default function EditorReviewModal({ review, onDismiss }) {
  const { mode, summary, flags = [] } = review;
  const icon = FLAG_ICONS[mode] ?? '◆';

  return (
    <div
      className="modal-backdrop editor-review-backdrop"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="modal editor-review-modal">
        <div className="modal-header">
          <div className="editor-review-header-text">
            <h2 className="modal-title">Editorial Notes</h2>
            <p className="editor-review-mode-label">{MODE_LABELS[mode] ?? mode}</p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body editor-review-body">
          {summary && (
            <div className="editor-review-summary">
              <p>{summary}</p>
            </div>
          )}

          {flags.length === 0 && (
            <p className="editor-review-empty">No issues found — this passage reads well.</p>
          )}

          {flags.length > 0 && (
            <div className="editor-review-flags">
              {flags.map((flag, i) => (
                <div key={i} className="editor-flag">
                  <div className="editor-flag-excerpt">
                    <span className="editor-flag-icon">{icon}</span>
                    <q>{flag.excerpt}</q>
                  </div>
                  <div className="editor-flag-body">
                    <p className="editor-flag-issue">{flag.issue}</p>
                    {flag.suggestion && (
                      <p className="editor-flag-suggestion">
                        <span className="editor-flag-suggestion-label">Try: </span>
                        {flag.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <p className="editor-review-footer-note">Your draft is unchanged.</p>
          <button className="btn btn-primary" onClick={onDismiss}>Done</button>
        </div>
      </div>
    </div>
  );
}
