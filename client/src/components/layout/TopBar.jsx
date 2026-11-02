import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { useLayoutMode } from '../../hooks/useLayoutMode.js';
import { drawerId } from '../../hooks/useDrawer.js';

export default function TopBar() {
  const { state: workState } = useActiveWork();
  const { state: editorState } = useEditor();
  const { state: uiState, dispatch } = useUI();
  const mode = useLayoutMode();

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

      {currentChapter && (
        <span className="topbar-chapter-pill">
          Ch. {currentChapter.number} — {currentChapter.title}
        </span>
      )}

      {work.currentDraft && (
        <span className="topbar-draft-badge">Draft {work.currentDraft}</span>
      )}

      <div className="topbar-spacer" />

      {saveStatusLabel()}
    </div>
  );
}
