import { useCallback, useEffect, useRef } from 'react';

// Hands focus back to a control after an editor that held focus has closed. The
// editor unmounts its focused field, so focus would fall to the page. Returns a
// setter: pass the control's ref to mark it as the return target, or null to clear
// it. On a render where focus is on the page and the target is on screen, it takes
// focus and clears the target. Focus that is elsewhere is left alone.
export function useReturnFocus() {
  const target = useRef(null);

  useEffect(() => {
    const el = target.current?.current;
    if (!el) return;
    // Focus is still in the editor, or the writer has moved on: keep the target
    // until focus is lost with the editor, which is when it is due. A container
    // that holds the target counts as lost: browsers focus .content and dialogs on click
    const active = document.activeElement;
    if (active && active !== document.body && !active.contains(el)) return;
    target.current = null;
    el.focus();
  });

  return useCallback((ref) => {
    target.current = ref;
  }, []);
}
