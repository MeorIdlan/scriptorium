import { useEditor } from '../../context/EditorContext.jsx';

export default function DraftPolishModal({ polished, onDismiss }) {
  const { replaceContent } = useEditor();

  function handleAccept() {
    replaceContent(polished);
    onDismiss();
  }

  return (
    <div
      className="modal-backdrop draft-polish-backdrop"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="modal draft-polish-modal">
        <div className="modal-header">
          <div className="draft-polish-header-text">
            <h2 className="modal-title">Polished Draft</h2>
            <p className="draft-polish-subtitle">Review the rewrite below. Your original is untouched until you accept.</p>
          </div>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>

        <div className="modal-body draft-polish-body">
          <pre className="draft-polish-preview">{polished}</pre>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onDismiss}>Discard</button>
          <button className="btn btn-primary" onClick={handleAccept}>
            Accept &amp; Replace
          </button>
        </div>
      </div>
    </div>
  );
}
