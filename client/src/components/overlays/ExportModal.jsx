import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { api } from '../../utils/api.js';

const FORMATS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'epub', label: 'EPUB' },
  { id: 'docx', label: 'DOCX' },
];

export default function ExportModal() {
  const { state, dispatch } = useUI();
  const [format, setFormat] = useState('pdf');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeOutline, setIncludeOutline] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  if (!state.exportModalOpen) return null;

  const workId = state.exportWorkId;

  function handleClose() {
    dispatch({ type: 'CLOSE_EXPORT' });
    setError(null);
  }

  async function handleExport() {
    if (!workId) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await api.post(`/works/${workId}/export`, {
        format,
        includeNotes,
        includeOutline,
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
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
