import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';

const Editor = forwardRef(function Editor({ workId, initialContent = '' }, ref) {
  const editorRef = useRef(null);
  const { state, setContent, clearReplacement } = useEditor();

  // Expose the inner DOM node via forwarded ref
  useImperativeHandle(ref, () => editorRef.current);

  // Set up autosave
  useAutosave(workId);

  // Load initial content only on mount or when key causes remount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialContent || '';
    }
    // Only run when component mounts (key-based remount handles chapter switching)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply programmatic content replacements (e.g., from Draft Polish)
  useEffect(() => {
    if (!state.pendingReplacement || !editorRef.current) return;
    editorRef.current.innerText = state.pendingReplacement.text;
    setContent(state.pendingReplacement.text);
    clearReplacement();
  }, [state.pendingReplacement, setContent, clearReplacement]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';
      setContent(text);
    }
  }, [setContent]);

  return (
    <div
      ref={editorRef}
      className="editor"
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      spellCheck
      data-placeholder="Begin your story…"
    />
  );
});

export default Editor;
