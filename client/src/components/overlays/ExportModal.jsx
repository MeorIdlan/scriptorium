import { useRef, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { api } from '../../utils/api.js';
import { saveFile } from '../../utils/saveFile.js';

const FORMATS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'epub', label: 'EPUB' },
  { id: 'docx', label: 'DOCX' },
];

const LAYOUTS = [
  { id: 'reading', label: 'Reading' },
  { id: 'manuscript', label: 'Manuscript' },
];

const EMPTY_MANUSCRIPT = {
  authorName: '',
  surname: '',
  contactBlock: '',
  headerTitle: '',
  font: 'serif',
  workOnly: false,
};

export default function ExportModal() {
  const { state, dispatch } = useUI();
  const [format, setFormat] = useState('pdf');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeOutline, setIncludeOutline] = useState(false);
  const [layout, setLayout] = useState('reading');
  const [manuscript, setManuscript] = useState(EMPTY_MANUSCRIPT);
  // idle until Manuscript is first picked, then loading, then ready
  const [prefill, setPrefill] = useState('idle');
  // Bumped on close, so a saved-details reply that lands after it is dropped
  const session = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState(null);

  if (!state.exportModalOpen) return null;

  const workId = state.exportWorkId;
  // EPUB has no manuscript layout, so the selector only applies to PDF and DOCX
  const manuscriptOn = format !== 'epub' && layout === 'manuscript';

  function handleClose() {
    dispatch({ type: 'CLOSE_EXPORT' });
    setError(null);
    setBackupError(null);
    setLayout('reading');
    setManuscript(EMPTY_MANUSCRIPT);
    setPrefill('idle');
    session.current += 1;
  }

  // Fills the manuscript fields with the writer's saved details. Asked once
  // per open; a failed request is asked again on the next pick.
  async function loadPrefill() {
    if (prefill !== 'idle' || !workId) return;
    const current = session.current;
    setError(null);
    setPrefill('loading');
    try {
      const saved = await api.get(`/works/${workId}/export/manuscript`);
      if (current !== session.current) return;
      setManuscript({
        authorName: saved.authorName,
        surname: saved.surname,
        contactBlock: saved.contactBlock,
        headerTitle: saved.headerTitle,
        font: saved.font,
        workOnly: saved.workOnly,
      });
      setPrefill('ready');
    } catch (err) {
      if (current !== session.current) return;
      setError(err.message);
      setPrefill('idle');
    }
  }

  function pickLayout(id) {
    setLayout(id);
    if (id === 'manuscript') loadPrefill();
    else setError(null); // a failed prefill is not an error for the reading layout
  }

  function setField(key, value) {
    setManuscript((m) => ({ ...m, [key]: value }));
  }

  async function handleExport() {
    if (!workId) return;
    setExporting(true);
    setError(null);
    const options = manuscriptOn
      ? { format, includeNotes: false, includeOutline, layout: 'manuscript', manuscript }
      : { format, includeNotes, includeOutline, layout: 'reading' };
    try {
      const { blob, filename } = await api.download(
        `/works/${workId}/export`,
        options,
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

          {format !== 'epub' && (
            <div className="form-group">
              <label className="form-label">Layout</label>
              <div className="format-selector">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    className={`format-btn${layout === l.id ? ' active' : ''}`}
                    data-testid={`layout-${l.id}`}
                    onClick={() => pickLayout(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {manuscriptOn && (
            <>
              <div className="form-group">
                <label className="form-label">Font</label>
                <div className="format-selector">
                  <button
                    className={`format-btn${manuscript.font === 'serif' ? ' active' : ''}`}
                    data-testid="ms-font-serif"
                    onClick={() => setField('font', 'serif')}
                  >
                    Serif
                  </button>
                  <button
                    className={`format-btn${manuscript.font === 'mono' ? ' active' : ''}`}
                    data-testid="ms-font-mono"
                    onClick={() => setField('font', 'mono')}
                  >
                    Mono
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Author name</label>
                <input
                  className="form-input"
                  type="text"
                  data-testid="ms-author"
                  value={manuscript.authorName}
                  onChange={(e) => setField('authorName', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Surname (for the header)</label>
                <input
                  className="form-input"
                  type="text"
                  data-testid="ms-surname"
                  value={manuscript.surname}
                  onChange={(e) => setField('surname', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact block</label>
                <textarea
                  className="form-textarea"
                  data-testid="ms-contact"
                  value={manuscript.contactBlock}
                  onChange={(e) => setField('contactBlock', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Header title</label>
                <input
                  className="form-input"
                  type="text"
                  data-testid="ms-header-title"
                  value={manuscript.headerTitle}
                  onChange={(e) => setField('headerTitle', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    data-testid="ms-work-only"
                    checked={manuscript.workOnly}
                    onChange={(e) => setField('workOnly', e.target.checked)}
                  />
                  Only for this work
                </label>
                <p className="form-hint">Your details are saved when you export.</p>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Options</label>
            <div className="checkbox-group">
              {!manuscriptOn && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                  />
                  Include chapter notes
                </label>
              )}
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
            disabled={exporting || (manuscriptOn && (prefill !== 'ready' || !manuscript.authorName.trim()))}
          >
            {exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
