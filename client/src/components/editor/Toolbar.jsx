import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAiState } from '../../context/AiContext.jsx';
import ChapterHistoryModal from '../overlays/ChapterHistoryModal.jsx';
import ChapterSummaryModal from '../overlays/ChapterSummaryModal.jsx';
import { insertSceneBreak } from '../../utils/scenes.js';
import { rememberedCaret } from '../../utils/editorBlocks.js';

const FONTS = ['Georgia', 'Arial', 'Verdana', 'Courier'];
const SIZES = [12, 14, 16, 18, 20];

export default function Toolbar({ editorRef }) {
  const { state: uiState, dispatch } = useUI();
  const { workId } = useParams();
  const { state: editorState } = useEditor();
  const { aiOn } = useAiState();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // The writer's selection inside the editor, kept for the font and size selects
  const editorRange = useRef(null);
  const [formats, setFormats] = useState({ bold: false, italic: false, underline: false });

  // Whether B, I and U are on at the selection; the browser answers for the caret too
  function readFormats() {
    const read = (command) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    return { bold: read('bold'), italic: read('italic'), underline: read('underline') };
  }

  useEffect(() => {
    function remember() {
      const root = editorRef.current;
      const sel = document.getSelection();
      if (root && sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
        editorRange.current = sel.getRangeAt(0).cloneRange();
        setFormats(readFormats());
      }
    }
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, [editorRef]);

  // Buttons focus the editor, then run the command on its selection
  function exec(command, value = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setFormats(readFormats());
  }

  // The selects keep focus, so the command goes to the selection the writer left in the editor
  function execOnSelection(command, value) {
    const sel = document.getSelection();
    if (editorRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(editorRange.current);
    }
    document.execCommand(command, false, value);
  }

  function setFont(font) {
    execOnSelection('fontName', font);
  }

  function setSize(size) {
    // execCommand fontSize uses 1-7, map px roughly
    const sizeMap = { 12: 1, 14: 2, 16: 3, 18: 4, 20: 5 };
    execOnSelection('fontSize', sizeMap[size] || 3);
  }

  return (
    <div className="toolbar">
      <select
        className="toolbar-select"
        onChange={(e) => setFont(e.target.value)}
        defaultValue="Georgia"
        title="Font family"
      >
        {FONTS.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <select
        className="toolbar-select"
        onChange={(e) => setSize(Number(e.target.value))}
        defaultValue="16"
        title="Font size"
      >
        {SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn"
        onClick={() => exec('bold')}
        aria-pressed={formats.bold}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        className="toolbar-btn toolbar-italic"
        onClick={() => exec('italic')}
        aria-pressed={formats.italic}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        className="toolbar-btn toolbar-underline"
        onClick={() => exec('underline')}
        aria-pressed={formats.underline}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn"
        onClick={() => exec('justifyLeft')}
        title="Align left"
        aria-label="Align left"
      >
        ≡
      </button>
      <button
        className="toolbar-btn"
        onClick={() => exec('justifyCenter')}
        title="Align center"
        aria-label="Align center"
      >
        ☰
      </button>
      <button
        className="toolbar-btn"
        onClick={() => exec('justifyRight')}
        title="Align right"
        aria-label="Align right"
      >
        ≡
      </button>

      <button
        className="toolbar-btn toolbar-scene"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const root = editorRef.current;
          if (root) insertSceneBreak(root, rememberedCaret(root));
        }}
        title="Add a scene break (Ctrl+Shift+Enter)"
        aria-label="Add a scene break"
      >
        ⁂
      </button>

      <div className="toolbar-divider" />

      {aiOn && (
        <button
          className="toolbar-btn toolbar-spark"
          onClick={() => {
            // The generator lives in the Quill tab: bring that tab forward. When the
            // generator is already open behind another tab, only the tab changes
            const quillShowing = uiState.activePanelTab === 'quill';
            if (!quillShowing) dispatch({ type: 'SET_PANEL_TAB', tab: 'quill' });
            if (!uiState.hookGeneratorOpen || quillShowing) dispatch({ type: 'TOGGLE_HOOK_GENERATOR' });
          }}
          title="Open Spark / Hook Generator"
        >
          ✨ Spark
        </button>
      )}
      <button
        className="toolbar-btn toolbar-spark"
        onClick={() => setHistoryOpen(true)}
        disabled={!editorState.chapterId}
        title="Compare, name and restore earlier versions of this chapter"
      >
        ⟲ History
      </button>
      {/* Summaries exist only for AI help */}
      {aiOn && (
        <button
          className="toolbar-btn toolbar-spark"
          onClick={() => setSummaryOpen(true)}
          disabled={!editorState.chapterId}
          title="View or edit the summary AI help uses for this chapter"
        >
          ☰ Summary
        </button>
      )}

      {historyOpen && (
        <ChapterHistoryModal
          workId={workId}
          chapterId={editorState.chapterId}
          onDismiss={() => setHistoryOpen(false)}
        />
      )}
      {aiOn && summaryOpen && (
        <ChapterSummaryModal
          workId={workId}
          chapterId={editorState.chapterId}
          onDismiss={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
