import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api.js';
import { formatNumber } from '../../utils/wordCount.js';
import { useWorks } from '../../context/WorksContext.jsx';
import { useUI } from '../../context/UIContext.jsx';

const TARGET_WORD_COUNT = 90000;

function relativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function statusLabel(status) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'dormant': return 'Dormant';
    default: return 'In Progress';
  }
}

export default function WorkCard({ work, onDelete, onExport }) {
  const navigate = useNavigate();
  const { removeWork, updateWork } = useWorks();
  const { dispatch: uiDispatch } = useUI();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);

  const wordCount = work.wordCount || 0;
  const target = work.targetWordCount || TARGET_WORD_COUNT;
  const progress = Math.min((wordCount / target) * 100, 100);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function handleArchive(e) {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await api.put(`/works/${work.id}`, { status: 'dormant' });
      updateWork(work.id, { status: 'dormant' });
    } catch (err) {
      console.error('Archive failed:', err);
    }
  }

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.delete(`/works/${work.id}`);
      removeWork(work.id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setMenuOpen(false);
    setConfirmDelete(false);
  }

  async function handleNewDraft(e) {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      const newDraft = (work.currentDraft || 1) + 1;
      await api.put(`/works/${work.id}`, { currentDraft: newDraft });
      updateWork(work.id, { currentDraft: newDraft });
    } catch (err) {
      console.error('New draft failed:', err);
    }
  }

  function handleExport(e) {
    e.stopPropagation();
    setMenuOpen(false);
    uiDispatch({ type: 'OPEN_EXPORT', workId: work.id });
  }

  function handleCardClick() {
    navigate(`/work/${work.id}`);
  }

  const coverColor = work.coverColor || '#2a2a3e';

  return (
    <div className="work-card" onClick={handleCardClick}>
      <div className="work-card-header">
        <span className="work-card-color-swatch" style={{ background: coverColor }} />
        <div className="work-card-menu-wrap" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            className="work-card-menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Work options"
          >
            ···
          </button>
          {menuOpen && (
            <div className="work-card-menu">
              <button onClick={() => { setMenuOpen(false); navigate(`/work/${work.id}`); }}>Open</button>
              <button onClick={handleNewDraft}>New Draft</button>
              <button onClick={handleExport}>Export</button>
              <button onClick={handleArchive}>Archive</button>
              <button
                className={confirmDelete ? 'danger-confirm' : 'danger'}
                onClick={handleDelete}
              >
                {confirmDelete ? 'Confirm Delete?' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="work-card-body">
        <h3 className="work-card-title">{work.title}</h3>
        {work.genre && <span className="work-card-genre">{work.genre}</span>}
        <p className="work-card-meta">
          {formatNumber(wordCount)} words · {relativeDate(work.updatedAt || work.lastTouched)}
        </p>
      </div>

      <div className="work-card-footer">
        <div className="work-card-progress-bar">
          <div className="work-card-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="work-card-footer-row">
          <span className={`work-card-status status-${work.status || 'active'}`}>
            {statusLabel(work.status)}
          </span>
          {work.currentDraft > 1 && (
            <span className="work-card-draft">Draft {work.currentDraft}</span>
          )}
        </div>
      </div>
    </div>
  );
}
