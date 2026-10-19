import ContextUsed from '../panel/ContextUsed.jsx';
import { useModal } from '../../hooks/useModal.js';

const TYPE_LABELS = {
  character: 'Character',
  place: 'Place',
  worldRule: 'Rule',
  general: 'General',
};

export default function CodexAuditModal({ audit, onDismiss }) {
  const { summary, findings = [], context } = audit;
  const { dialogProps, backdropProps } = useModal({ onClose: onDismiss });

  return (
    <div className="modal-backdrop codex-audit-backdrop" {...backdropProps}>
      <div className="modal codex-audit-modal" {...dialogProps}>
        <div className="modal-header">
          <div className="codex-audit-header-text">
            <h2 className="modal-title">Codex Audit</h2>
            <p className="codex-audit-subtitle">Cross-entry consistency &amp; completeness</p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="codex-audit-body">
          {summary && (
            <div className="codex-audit-summary">
              <p>{summary}</p>
            </div>
          )}

          {findings.length === 0 && (
            <p className="codex-audit-empty">Your codex looks solid — no major issues found.</p>
          )}

          {findings.length > 0 && (
            <div className="codex-audit-findings">
              {findings.map((finding, i) => (
                <div key={i} className="codex-audit-finding">
                  <div className="codex-audit-finding-meta">
                    <span className="codex-audit-finding-type">
                      {TYPE_LABELS[finding.entityType] ?? finding.entityType}
                    </span>
                    {finding.entityName && (
                      <span className="codex-audit-finding-name">{finding.entityName}</span>
                    )}
                  </div>
                  <p className="codex-audit-finding-issue">{finding.issue}</p>
                  {finding.suggestion && (
                    <p className="codex-audit-finding-suggestion">
                      <span className="codex-audit-suggestion-label">Try: </span>
                      {finding.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <ContextUsed context={context} />
        </div>

        <div className="modal-footer">
          <p className="editor-review-footer-note">Your codex is unchanged.</p>
          <button className="btn btn-primary" onClick={onDismiss}>Done</button>
        </div>
      </div>
    </div>
  );
}
