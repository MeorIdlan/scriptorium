import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';

// linkedom has no selection or execCommand. The toolbar reads the selection
// inside the editor and runs the command on it, so both are stubbed
function stubSelection(anchor) {
  const range = { cloneRange() { return this; } };
  const sel = {
    rangeCount: 1,
    anchorNode: anchor,
    getRangeAt: () => range,
    removeAllRanges() {},
    addRange(r) {
      sel.added = r;
    },
  };
  document.getSelection = () => sel;
  return { sel, range };
}

function setup() {
  const originalExec = document.execCommand;
  const originalSelection = document.getSelection;
  const calls = [];
  document.execCommand = (command, ui, value) => calls.push([command, value]);
  const editor = document.createElement('div');
  editor.className = 'editor';
  editor.innerHTML = '<p>The lamp would not stay lit.</p>';
  document.body.appendChild(editor);
  const { sel, range } = stubSelection(editor.firstChild);
  const restore = () => {
    document.execCommand = originalExec;
    document.getSelection = originalSelection;
    editor.remove();
  };
  return { editor, calls, sel, range, restore };
}

// Chooses an option: linkedom's select value can't be set, so this runs the
// select's React change handler with the chosen value
async function change(select, value) {
  const key = Object.keys(select).find((k) => k.startsWith('__reactProps'));
  await act(async () => select[key].onChange({ target: { value } }));
  await flush();
}

test('a font change keeps focus on the select and applies it to the saved selection', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    // The editor reports the caret as the writer moves it
    document.dispatchEvent(new window.Event('selectionchange'));
    const font = view.query('select[title="Font family"]');
    font.focus();
    await change(font, 'Arial');
    assert.equal(document.activeElement === font, true);
    assert.deepEqual(env.calls, [['fontName', 'Arial']]);
    assert.equal(env.sel.added, env.range);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('a size change keeps focus on the select and applies it to the saved selection', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    document.dispatchEvent(new window.Event('selectionchange'));
    const size = view.query('select[title="Font size"]');
    size.focus();
    await change(size, '18');
    assert.equal(document.activeElement === size, true);
    assert.deepEqual(env.calls, [['fontSize', 4]]);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('the bold button still applies to the editor and moves focus into it', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    const bold = view.query('button[title="Bold (Ctrl+B)"]');
    bold.focus();
    await click(bold);
    assert.deepEqual(env.calls, [['bold', null]]);
    assert.equal(document.activeElement === env.editor, true);
    await view.unmount();
  } finally {
    env.restore();
  }
});
