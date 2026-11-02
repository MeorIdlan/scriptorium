import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';

afterEach(resetViewport);

// linkedom has no selection or execCommand: stubbed as in toolbar.test.js
function setup() {
  const originalExec = document.execCommand;
  const originalSelection = document.getSelection;
  const calls = [];
  document.execCommand = (command, ui, value) => calls.push([command, value]);
  const editor = document.createElement('div');
  editor.className = 'editor';
  editor.innerHTML = '<p>The lamp would not stay lit.</p>';
  document.body.appendChild(editor);
  const range = { cloneRange() { return this; } };
  const sel = { rangeCount: 1, anchorNode: editor.firstChild, getRangeAt: () => range, removeAllRanges() {}, addRange() { editor.focus(); } };
  document.getSelection = () => sel;
  return {
    editor,
    calls,
    restore() {
      document.execCommand = originalExec;
      document.getSelection = originalSelection;
      editor.remove();
    },
  };
}

async function mount(env, width) {
  setViewport(width);
  return renderApp(h(Toolbar, { editorRef: { current: env.editor } }), {
    ai: false,
    path: '/work/w1/chapter/c1',
    route: '/work/:workId/chapter/:chapterId',
  });
}

const formatButtons = (view) => [
  view.query('button[title="Bold (Ctrl+B)"]'),
  view.query('button[title="Italic (Ctrl+I)"]'),
  view.query('button[title="Underline (Ctrl+U)"]'),
  view.query('button[aria-label="Align left"]'),
  view.query('button[aria-label="Align center"]'),
  view.query('button[aria-label="Align right"]'),
];

// A press that a browser would turn into a focus change unless it is cancelled
async function mouseDown(el) {
  const event = new window.Event('mousedown', { bubbles: true, cancelable: true });
  await act(async () => el.dispatchEvent(event));
  return event.defaultPrevented;
}

test('on a phone, pressing B, I, U or an alignment button does not take focus from the editor', async () => {
  const env = setup();
  try {
    const view = await mount(env, 390);
    for (const button of formatButtons(view)) {
      assert.ok(button, 'a formatting button is missing');
      assert.equal(await mouseDown(button), true, button.getAttribute('title') || button.getAttribute('aria-label'));
    }
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('on a tablet too', async () => {
  const env = setup();
  try {
    const view = await mount(env, 800);
    assert.equal(await mouseDown(formatButtons(view)[0]), true);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('on desktop the same presses are left alone (A4)', async () => {
  const env = setup();
  try {
    const view = await mount(env, 1280);
    for (const button of formatButtons(view)) {
      assert.equal(await mouseDown(button), false, button.getAttribute('title') || button.getAttribute('aria-label'));
    }
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('on a phone, Bold still runs on the editor and leaves it focused', async () => {
  const env = setup();
  try {
    const view = await mount(env, 390);
    await click(formatButtons(view)[0]);
    assert.deepEqual(env.calls, [['bold', null]]);
    assert.ok(document.activeElement === env.editor, 'the editor lost focus');
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('on a phone, the font and size selects still apply to the writer\'s selection', async () => {
  const env = setup();
  try {
    const view = await mount(env, 390);
    document.dispatchEvent(new window.Event('selectionchange'));
    const font = view.query('select[title="Font family"]');
    font.focus();
    const key = Object.keys(font).find((k) => k.startsWith('__reactProps'));
    await act(async () => font[key].onChange({ target: { value: 'Arial', focus: () => font.focus() } }));
    await flush();
    assert.deepEqual(env.calls, [['fontName', 'Arial']]);
    await view.unmount();
  } finally {
    env.restore();
  }
});
