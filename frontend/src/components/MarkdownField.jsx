import { useState, useRef, useEffect } from "react";
import { renderMarkdown } from "../lib/markdown";

const PREVIEW_STYLE = {
  fontFamily: "'Georgia', serif",
  fontSize: "inherit",
  lineHeight: "1.75",
  color: "#c8c0b0",
  cursor: "text",
  wordBreak: "break-word",
};

// Inline CSS injected once into the document for markdown element styling.
const MARKDOWN_CSS = `
.md-preview { font-family: 'Georgia', serif; }
.md-preview h1, .md-preview h2, .md-preview h3,
.md-preview h4, .md-preview h5, .md-preview h6 {
  color: #e8e0d0; font-weight: normal; margin: 0.75em 0 0.3em;
  letter-spacing: -0.01em; line-height: 1.35;
}
.md-preview h1 { font-size: 1.4em; }
.md-preview h2 { font-size: 1.2em; }
.md-preview h3 { font-size: 1.05em; }
.md-preview p { margin: 0.5em 0; }
.md-preview p:first-child { margin-top: 0; }
.md-preview p:last-child { margin-bottom: 0; }
.md-preview strong { color: #e8e0d0; font-weight: bold; }
.md-preview em { color: #c8c0b0; font-style: italic; }
.md-preview ul, .md-preview ol { margin: 0.4em 0; padding-left: 1.5em; }
.md-preview li { margin: 0.2em 0; }
.md-preview blockquote {
  border-left: 2px solid #c9a96e; margin: 0.5em 0;
  padding: 0.1em 0 0.1em 0.9em; color: #a0988a; font-style: italic;
}
.md-preview code {
  background: rgba(255,255,255,0.06); border-radius: 3px;
  padding: 0.1em 0.35em; font-size: 0.88em;
  font-family: monospace; color: #c9a96e;
}
.md-preview pre {
  background: rgba(0,0,0,0.3); border-radius: 5px;
  padding: 10px 14px; overflow-x: auto; margin: 0.5em 0;
}
.md-preview pre code { background: none; padding: 0; }
.md-preview hr { border: none; border-top: 1px solid #2e2e3a; margin: 0.75em 0; }
.md-preview a { color: #c9a96e; text-decoration: underline; }
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = MARKDOWN_CSS;
  document.head.appendChild(el);
}

export default function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 4,
  style = {},
  textareaStyle = {},
  minHeight,
}) {
  injectCss();
  const [editing, setEditing] = useState(!value);
  const textareaRef = useRef(null);

  // If value is cleared externally, go back to edit mode.
  useEffect(() => {
    if (!value) setEditing(true);
  }, [value]);

  const startEditing = () => {
    setEditing(true);
  };

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  const handleBlur = () => {
    if (value && value.trim()) setEditing(false);
  };

  const html = value ? renderMarkdown(value) : "";

  const baseTextareaStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "#0c0c14",
    border: "1.5px solid #2e2e3a",
    borderRadius: "6px",
    color: "#c8c0b0",
    padding: "12px 14px",
    fontSize: "14px",
    fontFamily: "'Georgia', serif",
    lineHeight: "1.75",
    resize: "vertical",
    outline: "none",
    minHeight: minHeight || undefined,
    ...textareaStyle,
  };

  const previewContainerStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "#0c0c14",
    border: "1.5px solid #2e2e3a",
    borderRadius: "6px",
    padding: "12px 14px",
    fontSize: "14px",
    minHeight: minHeight || `${rows * 1.75 + 1.5}em`,
    ...PREVIEW_STYLE,
    ...style,
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        style={baseTextareaStyle}
      />
    );
  }

  return (
    <div
      style={previewContainerStyle}
      onClick={startEditing}
      title="Click to edit"
    >
      <div
        className="md-preview"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ lineHeight: "1.75" }}
      />
    </div>
  );
}
