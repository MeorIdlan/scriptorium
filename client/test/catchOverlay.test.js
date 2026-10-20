import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useCallback, useEffect, useMemo } from 'react';
import { renderApp } from './support/app.js';
import './support/focus.js';
import { act, flush, press } from './support/render.js';
import { UIContext, useUI } from '../src/context/UIContext.jsx';
import CatchOverlay from '../src/components/overlays/CatchOverlay.jsx';

// Opens the catch overlay through the UI context, as the Ctrl+Shift+I shortcut does
function Driver() {
  const { dispatch } = useUI();
  useEffect(() => {
    dispatch({ type: 'OPEN_CATCH' });
  }, [dispatch]);
  return h(CatchOverlay);
}

// Logs every CLOSE_CATCH the overlay dispatches, passing each action through
function CountCloses({ log, children }) {
  const { state, dispatch } = useUI();
  // Stable, like the real dispatch: Driver's effect depends on it
  const counted = useCallback((action) => {
    if (action.type === 'CLOSE_CATCH') log.push(action.type);
    dispatch(action);
  }, [dispatch, log]);
  const value = useMemo(() => ({ state, dispatch: counted }), [state, counted]);
  return h(UIContext.Provider, { value }, children);
}

function keyEvent(key) {
  const event = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

test('the catch overlay is a non-modal dialog, and Esc in its input closes it', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  const dialog = view.query('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.hasAttribute('aria-modal'), false);
  await press(view.query('.catch-overlay-input'), 'Escape');
  assert.equal(view.query('.catch-overlay'), null);
  await view.unmount();
});

test('the catch overlay opens focused on its input', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  assert.equal(document.activeElement === view.query('.catch-overlay-input'), true);
  await view.unmount();
});

test('Esc outside the overlay closes it while it is open', async () => {
  const log = [];
  const view = await renderApp(h(CountCloses, { log }, h(Driver)));
  await flush();
  assert.ok(view.query('.catch-overlay'));
  const editor = document.createElement('div');
  document.body.appendChild(editor);
  await act(async () => {
    editor.dispatchEvent(keyEvent('Escape'));
  });
  await flush();
  assert.equal(view.query('.catch-overlay'), null);
  assert.equal(log.length, 1);
  editor.remove();
  await view.unmount();
});

test('one Esc inside the overlay closes it exactly once', async () => {
  const log = [];
  const view = await renderApp(h(CountCloses, { log }, h(Driver)));
  await flush();
  await press(view.query('.catch-overlay-input'), 'Escape');
  assert.equal(view.query('.catch-overlay'), null);
  assert.equal(log.length, 1);
  await view.unmount();
});
