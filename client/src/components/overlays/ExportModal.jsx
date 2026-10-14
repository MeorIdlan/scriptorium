import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { api } from '../../utils/api.js';

const FORMATS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'epub', label: 'EPUB' },
  { id: 'docx', label: 'DOCX' },
];

// Trigger the browser's save for a fetched file
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportModal() {
  const { state, dispatch } = useUI();
  const [format, setFormat] = useState('pdf');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeOutline, setIncludeOutline] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState(null);

  if (!state.exportModalOpen) return null;

  const workId = state.exportWorkId;

  function handleClose() {
    dispatch({ type: 'CLOSE_EXPORT' });
    setError(null);
    setBackupError(null);
  }

  async function handleExport() {
    if (!workId) return;
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await api.download(
        `/works/${workId}/export`,
        { format, includeNotes, includeOutline },
        `export.${format}`
      );

      saveFile(blob, filename);

      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleBackup() {
    if (!workId) return;
    setBackingUp(true);
    setBackupError(null);
    try {
      const { blob, filename } = await api.download(`/works/${workId}/backup`, {}, 'backup.zip');
      saveFile(blob, filename);
    } catch (err) {
      setBackupError(err.message);
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal export-modal">
        <div className="modal-header">
          <h2 className="modal-title">Export Work</h2>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Format</label>
            <div className="format-selector">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  className={`format-btn${format === f.id ? ' active' : ''}`}
                  onClick={() => setFormat(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Options</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                />
                Include chapter notes
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeOutline}
                  onChange={(e) => setIncludeOutline(e.target.checked)}
                />
                Include outline chapters
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Full backup</label>
            <p className="form-hint">
              A complete copy of this work: chapters as HTML and Markdown, history, milestones,
              plot threads, Codex and Map. It is not a manuscript.
            </p>
            <button
              className="btn btn-ghost"
              data-testid="backup-button"
              onClick={handleBackup}
              disabled={backingUp}
            >
              {backingUp ? 'Preparing backup…' : 'Full backup (.zip)'}
            </button>
            {backupError && <p className="form-error">{backupError}</p>}
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
