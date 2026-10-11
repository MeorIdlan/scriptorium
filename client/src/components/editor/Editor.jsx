import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor } from '../../context/EditorContext.jsx';
import { useAutosave } from '../../hooks/useAutosave.js';
import { getBlocks, pointToBlockOffset, topLevelNode, rememberCaret, rememberedCaret } from '../../utils/editorBlocks.js';
import { normalizeMarkers, insertSceneBreak } from '../../utils/scenes.js';

// The top-level node holding a range's end, as remembered for inserts
function caretTopNode(root, range) {
  const end = range.endContainer;
  return end === root ? root.childNodes[Math.max(0, range.endOffset - 1)] || null : topLevelNode(root, end);
}

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
      rememberCaret(root, caretTopNode(root, range));
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
    normalizeMarkers(editorRef.current);
    // Only run when component mounts (key-based remount handles chapter switching)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply programmatic content replacements (e.g., from Draft Polish)
  useEffect(() => {
    if (!state.pendingReplacement || !editorRef.current) return;
    const { text, html } = state.pendingReplacement;
    if (html) editorRef.current.innerHTML = html;
    else editorRef.current.innerText = text;
    normalizeMarkers(editorRef.current);
    setContent(editorRef.current.innerText || '', editorRef.current.innerHTML);
    clearReplacement();
  }, [state.pendingReplacement, setContent, clearReplacement]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      // Pasted markers may lack an id, repeat one, or be editable
      normalizeMarkers(editorRef.current);
      setContent(editorRef.current.innerText || '', editorRef.current.innerHTML);
    }
  }, [setContent]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const root = editorRef.current;
      if (!root) return;
      // selectionchange fires asynchronously, so a click followed at once by
      // the shortcut may not be remembered yet: read the live selection
      const sel = document.getSelection();
      const live = sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).endContainer) ? caretTopNode(root, sel.getRangeAt(0)) : null;
      insertSceneBreak(root, live || rememberedCaret(root));
    }
  }, []);

  return (
    <div
      ref={editorRef}
      className="editor"
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      spellCheck
      data-placeholder="Begin your story…"
    />
  );
});

export default Editor;
