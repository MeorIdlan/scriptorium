import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, createRef } from 'react';
import { renderApp } from './support/app.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';

// Icon-only buttons are named by what they do, not by the symbol drawn on them
test('the toolbar alignment and scene-break buttons are named', async () => {
  const view = await renderApp(h(Toolbar, { editorRef: createRef() }));
  assert.ok(view.query('button[aria-label="Align left"]'));
  assert.ok(view.query('button[aria-label="Align center"]'));
  assert.ok(view.query('button[aria-label="Align right"]'));
  assert.ok(view.query('button[aria-label="Add a scene break"]'));
  await view.unmount();
});
