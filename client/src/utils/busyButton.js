// A button that waits on a request stays focusable: a `disabled` button drops
// focus, and the writer loses their place. It reads as disabled through
// aria-disabled instead, and its handler is guarded so nothing fires while busy.
export function busyProps(busy) {
  return {
    'aria-disabled': busy ? 'true' : undefined,
    'data-busy': busy ? '' : undefined,
  };
}

// Wraps a click or submit handler so it does nothing while busy. A form submit
// is cancelled too, so Enter in a field does not send a second request.
export function guardBusy(busy, handler) {
  return (e) => {
    if (busy) {
      e.preventDefault();
      return;
    }
    handler(e);
  };
}
