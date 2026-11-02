import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup, act, flush } from './support/render.js';
import { createElement as h, useRef } from 'react';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import { useKeepCaretVisible } from '../src/hooks/useKeepCaretVisible.js';

// linkedom has no layout or selection: the editor's wrapper, the caret and the visual viewport are stubbed
let wrap;
let editor;
let caret;
let restoreSelection;
function stubs() {
  wrap = document.createElement('div');
  wrap.className = 'editor-wrap';
  wrap.scrollTop = 0;
  wrap.getBoundingClientRect = () => ({ top: 100, bottom: 700, left: 0, right: 390, width: 390, height: 600 });
  editor = document.createElement('div');
  wrap.appendChild(editor);
  document.body.appendChild(wrap);
  caret = { top: 300, bottom: 322 };
  const range = { collapsed: true, getClientRects: () => [{ top: caret.top, bottom: caret.bottom }], getBoundingClientRect: () => ({ top: caret.top, bottom: caret.bottom }) };
  const original = document.getSelection;
  document.getSelection = () => ({ rangeCount: 1, isCollapsed: true, getRangeAt: () => range });
  restoreSelection = () => {
    document.getSelection = original;
  };
  const vv = new EventTarget();
  vv.height = 844;
  vv.offsetTop = 0;
  window.visualViewport = vv;
  return vv;
}

function Probe({ active }) {
  const ref = useRef(editor);
  useKeepCaretVisible(ref, active);
  return h('span', null, 'x');
}

afterEach(async () => {
  await cleanup();
  resetViewport();
  restoreSelection?.();
  delete window.visualViewport;
  wrap?.remove();
});

test('when the keyboard hides the caret, the editor scrolls it back into view', async () => {
  setViewport(390);
  const vv = stubs();
  await render(h(Probe, { active: true }));
  editor.focus();
  vv.height = 480; // visible band now ends at 480; the caret sits at 650
  caret = { top: 628, bottom: 650 };
  await act(async () => vv.dispatchEvent(new Event('resize')));
  assert.equal(wrap.scrollTop, 650 - (480 - 24));
});

test('moving the caret down past the band scrolls too', async () => {
  setViewport(390);
  stubs();
  await render(h(Probe, { active: true }));
  editor.focus();
  caret = { top: 690, bottom: 712 };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 712 - (700 - 24));
});

test('nothing scrolls when the editor is not focused, or on desktop', async () => {
  setViewport(390);
  stubs();
  await render(h(Probe, { active: true }));
  caret = { top: 690, bottom: 712 };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 0, 'scrolled with the editor unfocused');
  await cleanup();
  await render(h(Probe, { active: false }));
  editor.focus();
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 0, 'scrolled while inactive');
  assert.ok(flush);
});
