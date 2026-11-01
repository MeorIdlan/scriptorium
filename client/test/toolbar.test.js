import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Profiler } from 'react';
import { act, click, flush, press } from './support/render.js';
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

// Presses the mouse on an element, which is what a pick with the pointer starts with
async function pointerDown(el) {
  await act(async () => el.dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
  await flush();
}

test('a font picked with the mouse moves focus into the editor and applies it there', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    document.dispatchEvent(new window.Event('selectionchange'));
    const font = view.query('select[title="Font family"]');
    font.focus();
    await pointerDown(font);
    await change(font, 'Arial');
    assert.equal(document.activeElement === env.editor, true);
    assert.deepEqual(env.calls, [['fontName', 'Arial']]);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('a size picked with the mouse moves focus into the editor and applies it there', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    const size = view.query('select[title="Font size"]');
    size.focus();
    await pointerDown(size);
    await change(size, '20');
    assert.equal(document.activeElement === env.editor, true);
    assert.deepEqual(env.calls, [['fontSize', 5]]);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('a keyboard pick after a mouse pick keeps focus on the select', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    const font = view.query('select[title="Font family"]');
    font.focus();
    await pointerDown(font);
    await press(font, 'ArrowDown');
    await change(font, 'Courier');
    assert.equal(document.activeElement === font, true);
    assert.deepEqual(env.calls, [['fontName', 'Courier']]);
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('Enter on a select moves focus to the editor', async () => {
  const env = setup();
  try {
    const view = await renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
    const size = view.query('select[title="Font size"]');
    size.focus();
    await press(size, 'Enter');
    assert.equal(document.activeElement === env.editor, true);
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
    await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
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

// The caret moves far more often than B, I and U change, so an unchanged selection must not re-render the toolbar
test('a selection change that leaves B, I and U as they were does not re-render the toolbar', async () => {
  const env = setup();
  const originalQuery = document.queryCommandState;
  document.queryCommandState = (command) => command === 'bold';
  let commits = 0;
  try {
    const view = await renderApp(
      h(Profiler, { id: 'toolbar', onRender: () => commits++ }, h(Toolbar, { editorRef: { current: env.editor } })),
      { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' }
    );
    await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
    const before = commits;
    await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
    assert.equal(commits, before);
    // A change that does flip a format still re-renders
    document.queryCommandState = (command) => command === 'italic';
    await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
    assert.equal(commits > before, true);
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

// The editor's default is EB Garamond at 19 (card uqVctsf5). Existing fonts and sizes stay.
const optionTexts = (select) => [...select.querySelectorAll('option')].map((o) => o.textContent);
const chosen = (select) => [...select.querySelectorAll('option')].find((o) => o.selected || o.hasAttribute('selected'))?.textContent;

async function renderToolbar(env) {
  return renderApp(h(Toolbar, { editorRef: { current: env.editor } }), { ai: false, path: '/work/w1/chapter/c1', route: '/work/:workId/chapter/:chapterId' });
}

test('the font select lists EB Garamond first, keeps the old fonts, and defaults to EB Garamond', async () => {
  const env = setup();
  try {
    const view = await renderToolbar(env);
    const font = view.query('select[title="Font family"]');
    assert.deepEqual(optionTexts(font), ['EB Garamond', 'Georgia', 'Arial', 'Verdana', 'Courier']);
    assert.equal(chosen(font), 'EB Garamond');
    await view.unmount();
  } finally {
    env.restore();
  }
});

test('the size select lists 19 between 18 and 20 and defaults to 19', async () => {
  const env = setup();
  try {
    const view = await renderToolbar(env);
    const size = view.query('select[title="Font size"]');
    assert.deepEqual(optionTexts(size), ['12', '14', '16', '18', '19', '20']);
    assert.equal(chosen(size), '19');
    await view.unmount();
  } finally {
    env.restore();
  }
});

// execCommand's fontSize takes 1 to 7, so 19px has no number. 19 asks for size 7, which the
// toolbar then rewrites as a span with an exact size, so the text really is 19px.
function stubFontSizeSeven(env) {
  document.execCommand = (command, ui, value) => {
    env.calls.push([command, value]);
    if (command === 'fontSize') env.editor.innerHTML = `<p><font size="${value}">The lamp would not stay lit.</font></p>`;
  };
  const created = [];
  const original = document.createRange;
  document.createRange = () => {
    const range = { setStartBefore(n) { this.start = n; }, setEndAfter(n) { this.end = n; } };
    created.push(range);
    return range;
  };
  return { created, restore: () => { document.createRange = original; } };
}

test('choosing 19 turns the size-7 font elements into spans of 19px and keeps the selection on them', async () => {
  const env = setup();
  const ranges = stubFontSizeSeven(env);
  try {
    const view = await renderToolbar(env);
    document.dispatchEvent(new window.Event('selectionchange'));
    const size = view.query('select[title="Font size"]');
    size.focus();
    await change(size, '19');
    assert.deepEqual(env.calls, [['fontSize', 7]]);
    assert.equal(env.editor.innerHTML, '<p><span style="font-size: 19px">The lamp would not stay lit.</span></p>');
    assert.equal(env.editor.querySelectorAll('font[size="7"]').length, 0);
    // The new span is selected again, and a keyboard pick leaves focus on the select
    const span = env.editor.querySelector('span');
    assert.equal(ranges.created.length, 1);
    assert.equal(ranges.created[0].start === span && ranges.created[0].end === span, true);
    assert.equal(env.sel.added, ranges.created[0]);
    assert.equal(document.activeElement === size, true);
    await view.unmount();
  } finally {
    ranges.restore();
    env.restore();
  }
});

// What the editor's input handler sees: autosave copies innerHTML each time input fires. A real
// execCommand fires input before the font elements are rewritten, so the toolbar must fire it again.
test('choosing 19 fires input again once the spans are in, so the saved HTML has no size 7', async () => {
  const env = setup();
  const ranges = stubFontSizeSeven(env);
  try {
    const view = await renderToolbar(env);
    document.dispatchEvent(new window.Event('selectionchange'));
    const seen = [];
    env.editor.addEventListener('input', () => seen.push(env.editor.innerHTML));
    const size = view.query('select[title="Font size"]');
    size.focus();
    await change(size, '19');
    assert.equal(seen.length >= 1, true, 'input never fired after the rewrite');
    const last = seen[seen.length - 1];
    assert.match(last, /<span style="font-size: 19px">/);
    assert.doesNotMatch(last, /font size="7"/);
    await view.unmount();
  } finally {
    ranges.restore();
    env.restore();
  }
});

test('choosing 19 leaves size-7 text that was already in the chapter alone', async () => {
  const env = setup();
  const ranges = stubFontSizeSeven(env);
  try {
    env.editor.innerHTML = '<p><font size="7" id="old">Pasted headline</font> and the lamp.</p>';
    // execCommand wraps only the selection: add one new size-7 element beside the old one
    document.execCommand = (command, ui, value) => {
      env.calls.push([command, value]);
      const made = document.createElement('font');
      made.setAttribute('size', String(value));
      made.textContent = 'the lamp';
      env.editor.querySelector('p').appendChild(made);
    };
    const view = await renderToolbar(env);
    document.dispatchEvent(new window.Event('selectionchange'));
    const size = view.query('select[title="Font size"]');
    size.focus();
    await change(size, '19');
    assert.equal(env.editor.querySelectorAll('font[size="7"]').length, 1, 'the pasted run keeps its size');
    assert.equal(env.editor.querySelector('#old').tagName.toLowerCase(), 'font');
    assert.equal(env.editor.querySelectorAll('span[style="font-size: 19px"]').length, 1);
    await view.unmount();
  } finally {
    ranges.restore();
    env.restore();
  }
});

test('choosing 19 with the mouse leaves focus in the editor', async () => {
  const env = setup();
  const ranges = stubFontSizeSeven(env);
  try {
    const view = await renderToolbar(env);
    const size = view.query('select[title="Font size"]');
    size.focus();
    await pointerDown(size);
    await change(size, '19');
    assert.equal(env.editor.querySelectorAll('span[style="font-size: 19px"]').length, 1);
    assert.equal(document.activeElement === env.editor, true);
    await view.unmount();
  } finally {
    ranges.restore();
    env.restore();
  }
});

test('choosing 19 at a bare caret does nothing, so no size-7 text is left behind', async () => {
  const env = setup();
  const ranges = stubFontSizeSeven(env);
  try {
    const view = await renderToolbar(env);
    document.dispatchEvent(new window.Event('selectionchange'));
    env.range.collapsed = true;
    const size = view.query('select[title="Font size"]');
    size.focus();
    await change(size, '19');
    assert.deepEqual(env.calls, []);
    await view.unmount();
  } finally {
    ranges.restore();
    env.restore();
  }
});

