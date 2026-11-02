import { useEffect } from 'react';
import { caretScrollDelta } from '../utils/caretVisible.js';

const MARGIN = 24;

// The caret's line box: a collapsed range has no rect on an empty line, so fall back to the
// range's own box and then to the element it sits in
function caretRect(range) {
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  const box = range.getBoundingClientRect?.();
  if (box && (box.height || box.top)) return box;
  const node = range.startContainer;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return el ? el.getBoundingClientRect() : null;
}

// While the editor has focus and `active` is true (phones and tablets), keeps the caret inside
// the part of the editor the writer can see: when the keyboard shrinks the visual viewport and
// when the caret moves. The editor's own wrapper (.editor-wrap) is what scrolls.
export function useKeepCaretVisible(editorRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const vv = window.visualViewport;

    function keep() {
      const root = editorRef.current;
      if (!root || document.activeElement !== root) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
      const rect = caretRect(sel.getRangeAt(0));
      const wrap = root.closest('.editor-wrap');
      if (!rect || !wrap) return;
      const box = wrap.getBoundingClientRect();
      const viewTop = Math.max(box.top, vv ? vv.offsetTop : 0);
      const viewBottom = Math.min(box.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
      const delta = caretScrollDelta({ caretTop: rect.top, caretBottom: rect.bottom, viewTop, viewBottom, margin: MARGIN });
      if (delta) wrap.scrollTop += delta;
    }

    document.addEventListener('selectionchange', keep);
    vv?.addEventListener('resize', keep);
    return () => {
      document.removeEventListener('selectionchange', keep);
      vv?.removeEventListener('resize', keep);
    };
  }, [editorRef, active]);
}
