import { useActiveWork } from '../../context/ActiveWorkContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';

export default function TopBar() {
  const { state: workState } = useActiveWork();
  const { state: editorState } = useEditor();

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
        <span className="topbar-brand">Scriptorium</span>
      </div>
    );
  }

  return (
    <div className="topbar">
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
