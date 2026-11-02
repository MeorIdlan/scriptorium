import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup, act } from './support/render.js';
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
  const range = {
    collapsed: true,
    startContainer: editor,
    startOffset: 0,
    getClientRects: () => (caret.noRects ? [] : [{ top: caret.top, bottom: caret.bottom }]),
    getBoundingClientRect: () => (caret.noRects ? { top: 0, bottom: 0, height: 0 } : { top: caret.top, bottom: caret.bottom, height: caret.bottom - caret.top }),
  };
  stubs.range = range;
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
});

test('moving the caret above the band scrolls up', async () => {
  setViewport(390);
  stubs();
  wrap.scrollTop = 500;
  await render(h(Probe, { active: true }));
  editor.focus();
  caret = { top: 110, bottom: 132 };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 500 + (110 - (100 + 24)));
});

test('the band starts at the visual viewport\'s offset when that is lower than the editor', async () => {
  setViewport(390);
  const vv = stubs();
  vv.offsetTop = 200; // iOS panned the page: the visible band is 200 to 500
  vv.height = 300;
  wrap.scrollTop = 500;
  await render(h(Probe, { active: true }));
  editor.focus();
  caret = { top: 210, bottom: 232 };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 500 + (210 - (200 + 24)));
});

test('a caret on an empty line, with no rect, is measured from the block before it', async () => {
  setViewport(390);
  stubs();
  const block = document.createElement('p');
  block.getBoundingClientRect = () => ({ top: 690, bottom: 712, height: 22 });
  editor.appendChild(block);
  stubs.range.startContainer = editor;
  stubs.range.startOffset = 1; // after the one paragraph
  await render(h(Probe, { active: true }));
  editor.focus();
  caret = { noRects: true };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 712 - (700 - 24));
});

test('a fallback box taller than the visible band is ignored rather than scrolled to its end', async () => {
  setViewport(390);
  stubs();
  editor.getBoundingClientRect = () => ({ top: -4000, bottom: 2000, height: 6000 });
  stubs.range.startContainer = editor; // an editor with no children: only the editor's own box is left
  await render(h(Probe, { active: true }));
  editor.focus();
  caret = { noRects: true };
  await act(async () => document.dispatchEvent(new window.Event('selectionchange')));
  assert.equal(wrap.scrollTop, 0);
});
