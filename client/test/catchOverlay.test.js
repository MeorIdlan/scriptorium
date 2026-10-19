import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useEffect } from 'react';
import { renderApp } from './support/app.js';
import { flush, press } from './support/render.js';
import { useUI } from '../src/context/UIContext.jsx';
import CatchOverlay from '../src/components/overlays/CatchOverlay.jsx';

// Opens the catch overlay through the UI context, as the Ctrl+Shift+I shortcut does
function Driver() {
  const { dispatch } = useUI();
  useEffect(() => {
    dispatch({ type: 'OPEN_CATCH' });
  }, [dispatch]);
  return h(CatchOverlay);
}

test('the catch overlay is a labelled dialog, and Esc in its input closes it', async () => {
  const view = await renderApp(h(Driver));
  await flush();
  const dialog = view.query('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  await press(view.query('.catch-overlay-input'), 'Escape');
  assert.equal(view.query('.catch-overlay'), null);
  await view.unmount();
});
