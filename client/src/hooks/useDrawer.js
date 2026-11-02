import { useCallback, useEffect, useRef } from 'react';
import { useUI } from '../context/UIContext.jsx';
import { FOCUSABLE } from './useModal.js';

export const drawerId = (name) => `drawer-${name}`;

// Drawer behaviour for an element that stays mounted (so its state survives a
// close), unlike useModal, which focuses on mount. `placement` is 'left',
// 'right' or 'bottom' when the layout mode makes this area a drawer, and null
// when it sits inline: then className is '' and attrs is {}, so spreading them
// leaves the element exactly as it was.
//   <aside className={`x${d.className}`} {...d.attrs}>
export function useDrawer(name, placement, label) {
  const { state, dispatch } = useUI();
  const ref = useRef(null);
  const isDrawer = placement != null;
  const isOpen = isDrawer && state.drawer === name;

  const open = useCallback(() => dispatch({ type: 'OPEN_DRAWER', name }), [dispatch, name]);
  const close = useCallback(() => dispatch({ type: 'CLOSE_DRAWER' }), [dispatch]);

  // On open: focus moves inside; on close: back to whatever opened it
  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement;
    const el = ref.current;
    if (el) (el.querySelector(FOCUSABLE) || el).focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const el = ref.current;
    const items = el.querySelectorAll(FOCUSABLE);
    if (items.length === 0) {
      e.preventDefault();
      el.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !el.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!isDrawer) return { isDrawer, isOpen, open, close, className: '', attrs: {} };

  return {
    isDrawer,
    isOpen,
    open,
    close,
    className: ` drawer drawer--${placement}${isOpen ? ' is-open' : ''}`,
    attrs: {
      ref,
      id: drawerId(name),
      role: 'dialog',
      'aria-label': label,
      'aria-modal': isOpen ? 'true' : undefined,
      tabIndex: -1,
      // React 18 drops a boolean `inert`, so it is passed as an empty string
      inert: isOpen ? undefined : '',
      onKeyDown,
    },
  };
}
