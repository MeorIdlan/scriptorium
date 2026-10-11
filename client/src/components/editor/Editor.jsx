import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { getBlocks, pointToBlockOffset, topLevelNode, rememberCaret } from '../../utils/editorBlocks.js';

const Editor = forwardRef(function Editor({ workId, initialContent = '', initialHtml = '' }, ref) {
  const editorRef = useRef(null);
  const { state, setContent, clearReplacement, setSelection } = useEditor();

  // Expose the inner DOM node via forwarded ref
  useImperativeHandle(ref, () => editorRef.current);

  // Set up autosave
  useAutosave(workId);

  // Remember the last selection made inside the editor: clicking a button in
  // the side panel can take the selection away before Polish reads it
  useEffect(() => {
    function handleSelectionChange() {
      const root = editorRef.current;
      const sel = document.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      // Remembered for inserting catches; cheap, so it runs on every caret move
      const end = range.endContainer;
      rememberCaret(
        root,
        end === root ? root.childNodes[Math.max(0, range.endOffset - 1)] || null : topLevelNode(root, end)
      );
      if (range.collapsed) {
        setSelection(null);
        return;
      }
      const blocks = getBlocks(root);
      const start = pointToBlockOffset(root, blocks, range.startContainer, range.startOffset);
      const stop = pointToBlockOffset(root, blocks, range.endContainer, range.endOffset);
      setSelection(start && stop ? { start, end: stop } : null);
    }
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [setSelection]);

  // Load initial content only on mount or when key causes remount
  useEffect(() => {
    if (!editorRef.current) return;
    if (initialHtml) {
      // Sanitized server-side on save
      editorRef.current.innerHTML = initialHtml;
    } else {
      // Chapters saved before HTML storage only have plain text; innerText
      // turns its newlines back into line breaks
      editorRef.current.innerText = initialContent || '';
    }
    // Only run when component mounts (key-based remount handles chapter switching)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply programmatic content replacements (e.g., from Draft Polish)
  useEffect(() => {
    if (!state.pendingReplacement || !editorRef.current) return;
    const { text, html } = state.pendingReplacement;
    if (html) editorRef.current.innerHTML = html;
    else editorRef.current.innerText = text;
    setContent(editorRef.current.innerText || '', editorRef.current.innerHTML);
    clearReplacement();
  }, [state.pendingReplacement, setContent, clearReplacement]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      setContent(editorRef.current.innerText || '', editorRef.current.innerHTML);
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
