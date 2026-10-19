import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

// Focus handling for a modal dialog: opens focused inside it, keeps Tab
// inside it, closes on Esc, returns focus to the opener, and closes on a
// backdrop click. Spread dialogProps on the dialog element and backdropProps
// on the backdrop behind it.
export function useModal({ onClose, initialFocusRef } = {}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    const target = initialFocusRef?.current || dialog.querySelector(FOCUSABLE) || dialog;
    target.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
    // Runs once per open; the opener and first focus are fixed at mount
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;

    const dialog = dialogRef.current;
    const items = dialog.querySelectorAll(FOCUSABLE);
    if (items.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    dialogProps: {
      ref: dialogRef,
      role: 'dialog',
      'aria-modal': 'true',
      tabIndex: -1,
      onKeyDown,
    },
    backdropProps: {
      onClick(e) {
        if (e.target === e.currentTarget) onClose?.();
      },
    },
  };
}
