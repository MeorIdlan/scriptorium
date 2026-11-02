import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { useLayoutMode } from '../../hooks/useLayoutMode.js';
import { useCoarsePointer } from '../../hooks/useCoarsePointer.js';
import { drawerId } from '../../hooks/useDrawer.js';
import { useLocation } from 'react-router-dom';
import { isMainRoomPath } from '../../utils/mainRoomPath.js';

export default function TopBar() {
  const { state: workState } = useActiveWork();
  const { state: editorState } = useEditor();
  const { state: uiState, dispatch } = useUI();
  const mode = useLayoutMode();
  const coarse = useCoarsePointer();
  const { pathname } = useLocation();

  // Catch otherwise opens only with Ctrl/Cmd+Shift+I, so phones, tablets and touch screens get a
  // button, but only with a work open (below): a catch is saved into a work. A desktop with a mouse
  // renders nothing here, so its layout is unchanged
  const catchButton =
    mode === 'desktop' && !coarse ? null : (
      <button
        type="button"
        className="topbar-catch"
        aria-label="Catch an idea"
        onClick={() => dispatch({ type: 'OPEN_CATCH' })}
      >
        Catch
      </button>
    );

  // Phones and tablets open the app nav as a drawer from here
  const menuButton =
    mode === 'desktop' ? null : (
      <button
        type="button"
        className="topbar-menu"
        aria-label="Open menu"
        aria-expanded={uiState.drawer === 'nav'}
        aria-controls={drawerId('nav')}
        onClick={() => dispatch({ type: 'OPEN_DRAWER', name: 'nav' })}
      >
        <span className="topbar-menu-bars" aria-hidden="true" />
      </button>
    );

  const work = workState.work;
  const chapters = workState.chapters;
  const currentChapter = chapters.find((ch) => ch.id === editorState.chapterId);

  const saveStatusLabel = () => {
    switch (editorState.saveStatus) {
      case 'saving': return <span className="save-status saving">Saving…</span>;
      case 'error': return <span className="save-status error">Save failed</span>;
      case 'saved': return editorState.chapterId
        ? <span className="save-status saved">Saved ✓</span>
        : null;
      default: return null;
    }
  };

  if (!work) {
    return (
      <div className="topbar">
        {menuButton}
        <span className="topbar-brand">Scriptorium</span>
      </div>
    );
  }

  return (
    <div className="topbar">
      {menuButton}
      <span className="topbar-title">{work.title}</span>

      {/* On a phone the chapter list is a drawer, and this opens it. It is there even with no chapter
          open (a new work has none), since the drawer holds the only way to add one */}
      {mode === 'phone' && isMainRoomPath(pathname) ? (
        <button
          type="button"
          className="topbar-chapter-pill topbar-chapter-button"
          aria-expanded={uiState.drawer === 'chapters'}
          aria-controls={drawerId('chapters')}
          onClick={() => dispatch({ type: 'OPEN_DRAWER', name: 'chapters' })}
        >
          {currentChapter ? `Ch. ${currentChapter.number} — ${currentChapter.title}` : 'Chapters'}
        </button>
      ) : (
        currentChapter && (
          <span className="topbar-chapter-pill">
            Ch. {currentChapter.number} — {currentChapter.title}
          </span>
        )
      )}

      {work.currentDraft && (
        <span className="topbar-draft-badge">Draft {work.currentDraft}</span>
      )}

      <div className="topbar-spacer" />

      {saveStatusLabel()}
      {catchButton}
    </div>
  );
}
