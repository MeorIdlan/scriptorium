import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment, useEffect } from 'react';
import { click, flush, press } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import QuillTab from '../src/components/panel/QuillTab.jsx';
import PolishReviewModal from '../src/components/overlays/PolishReviewModal.jsx';
import { useEditor } from '../src/context/EditorContext.jsx';

const text = 'She very walked home.';
const session = {
  mode: 'chapter',
  batches: [[{ id: 't1', blockIndex: 0, start: 0, text }]],
  blockTexts: [text],
  chapterText: text,
};
const rewrites = { rewrites: [{ id: 't1', text: 'She deeply strode home.' }], missing: [], context: null };

const quillRoutes = {
  'GET /works/w1': { id: 'w1', title: 'Book', wordCount: 0 },
  'GET /works/w1/chapters': [],
  'GET /works/w1/catches': [],
  'GET /works/w1/sessions/latest': {},
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'POST /ai/polish-draft': rewrites,
};

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

// Puts text in the editor state, which the Quill tab reads to enable Polish
function SeedEditor() {
  const { setContent } = useEditor();
  useEffect(() => {
    setContent(text, `<p>${text}</p>`);
  }, []);
  return null;
}

// The Polish button reads the chapter from the editor element in the page
function withEditorElement() {
  const editor = document.createElement('div');
  editor.className = 'editor';
  editor.innerHTML = `<p>${text}</p>`;
  document.body.appendChild(editor);
  return () => editor.remove();
}

async function openQuillWithPolish() {
  const view = await renderApp(h(Fragment, null, h(SeedEditor), h(QuillTab, { workId: 'w1' })), { ai: true, routes: quillRoutes });
  await flush();
  return view;
}

test('the Polish review names each accept button', async () => {
  const view = await renderApp(h(PolishReviewModal, { workId: 'w1', chapterId: 'c1', session, summariesPending: false, onClose() {} }), {
    ai: true,
    routes: { 'POST /ai/polish-draft': rewrites },
  });
  await flush();
  // The review is portalled to the body, outside the view's container
  const accept = document.querySelector('.polish-change-btn');
  assert.equal(accept.getAttribute('aria-label'), 'Accept this change');
  await view.unmount();
});

test('while its review is open, Polish is aria-disabled rather than disabled', async () => {
  const removeEditor = withEditorElement();
  const view = await openQuillWithPolish();
  const polish = view.button('Polish chapter');
  await pressButton(polish);
  await flush();
  // A disabled button drops focus; aria-disabled keeps it where the writer left it
  assert.ok(document.querySelector('.polish-review-modal'));
  assert.equal(polish.hasAttribute('disabled'), false);
  assert.equal(polish.getAttribute('aria-disabled'), 'true');
  await view.unmount();
  removeEditor();
});

test('closing the Polish review returns focus to Polish', async () => {
  const removeEditor = withEditorElement();
  const view = await openQuillWithPolish();
  const polish = view.button('Polish chapter');
  await pressButton(polish);
  await flush();
  await press(document.querySelector('.polish-review-modal'), 'Escape');
  await flush();
  assert.equal(document.querySelector('.polish-review-modal'), null);
  assert.equal(document.activeElement === polish, true);
  await view.unmount();
  removeEditor();
});
