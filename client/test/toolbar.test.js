import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';

// linkedom has no selection or execCommand. The toolbar reads the selection
// inside the editor and runs the command on it, so both are stubbed. As in
// Chrome, adding a range inside an editor focuses the editor.
function stubSelection(anchor, editor) {
  const range = { cloneRange() { return this; } };
  const sel = {
    rangeCount: 1,
    anchorNode: anchor,
    getRangeAt: () => range,
    removeAllRanges() {},
    addRange(r) {
      sel.added = r;
      editor.focus();
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
  const { sel, range } = stubSelection(editor.firstChild, editor);
  const restore = () => {
    document.execCommand = originalExec;
    document.getSelection = originalSelection;
    editor.remove();
  };
  return { editor, calls, sel, range, restore };
}

// Chooses an option: linkedom's select value can't be set, so this runs the
// select's React change handler with the chosen value and the select as target
async function change(select, value) {
  const key = Object.keys(select).find((k) => k.startsWith('__reactProps'));
  const target = { value, focus: () => select.focus() };
  await act(async () => select[key].onChange({ target }));
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
    // The selection is still in the editor, so it is not moved
    assert.equal(env.sel.added, undefined);
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

test('B, I and U show whether their format is on at the selection', async () => {
  const env = setup();
  const originalQuery = document.queryCommandState;
  // The browser reports the formats at the selection; bold is on there
  document.queryCommandState = (command) => command === 'bold';
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    document.dispatchEvent(new window.Event('selectionchange'));
    await flush();
    const pressed = (title) => view.query(`button[title="${title}"]`).getAttribute('aria-pressed');
    assert.equal(pressed('Bold (Ctrl+B)'), 'true');
    assert.equal(pressed('Italic (Ctrl+I)'), 'false');
    assert.equal(pressed('Underline (Ctrl+U)'), 'false');
    await view.unmount();
  } finally {
    document.queryCommandState = originalQuery;
    env.restore();
  }
});

test('when the selection has left the editor, the command still applies to the saved one and focus stays on the select', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    document.dispatchEvent(new window.Event('selectionchange'));
    // Something else took the selection, outside the editor
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    env.sel.anchorNode = elsewhere;
    const font = view.query('select[title="Font family"]');
    font.focus();
    await change(font, 'Verdana');
    assert.equal(env.sel.added, env.range);
    assert.deepEqual(env.calls, [['fontName', 'Verdana']]);
    assert.equal(document.activeElement === font, true);
    elsewhere.remove();
    await view.unmount();
  } finally {
    env.restore();
  }
});

