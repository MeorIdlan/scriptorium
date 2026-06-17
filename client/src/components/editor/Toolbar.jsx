import { useUI } from '../../context/UIContext.jsx';

const FONTS = ['Georgia', 'Arial', 'Verdana', 'Courier'];
const SIZES = [12, 14, 16, 18, 20];

export default function Toolbar({ editorRef }) {
  const { dispatch } = useUI();

  function exec(command, value = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function setFont(font) {
    exec('fontName', font);
  }

  function setSize(size) {
    // execCommand fontSize uses 1-7, map px roughly
    const sizeMap = { 12: 1, 14: 2, 16: 3, 18: 4, 20: 5 };
    exec('fontSize', sizeMap[size] || 3);
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
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        className="toolbar-btn toolbar-italic"
        onClick={() => exec('italic')}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        className="toolbar-btn toolbar-underline"
        onClick={() => exec('underline')}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn"
        onClick={() => exec('justifyLeft')}
        title="Align left"
      >
        ≡
      </button>
      <button
        className="toolbar-btn"
        onClick={() => exec('justifyCenter')}
        title="Align center"
      >
        ☰
      </button>
      <button
        className="toolbar-btn"
        onClick={() => exec('justifyRight')}
        title="Align right"
      >
        ≡
      </button>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn toolbar-spark"
        onClick={() => dispatch({ type: 'TOGGLE_HOOK_GENERATOR' })}
        title="Open Spark / Hook Generator"
      >
        ✨ Spark
      </button>
    </div>
  );
}
