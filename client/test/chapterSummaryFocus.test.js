import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click, press, type } from './support/render.js';
import { renderApp, aiSettings } from './support/app.js';
import './support/focus.js';
import ChapterSummaryModal from '../src/components/overlays/ChapterSummaryModal.jsx';

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', wordCount: 1200 },
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One', wordCount: 1200, summaryStatus: 'edited', summary: { text: 'Old summary' } }],
  'PUT /works/w1/chapters/c1/summary': {},
};

async function openEditor() {
  const view = await renderApp(h(ChapterSummaryModal, { workId: 'w1', chapterId: 'c1', onDismiss() {} }), { ai: true, routes });
  await click(view.button('Edit'));
  return view;
}

test('Save returns focus to Edit', async () => {
  const view = await openEditor();
  await type(view.query('.chapter-summary-textarea'), 'New summary');
  await click(view.button('Save'));
  assert.equal(document.activeElement === view.button('Edit'), true);
  await view.unmount();
});

test('Cancel returns focus to Edit', async () => {
  const view = await openEditor();
  await click(view.button('Cancel'));
  assert.equal(document.activeElement === view.button('Edit'), true);
  await view.unmount();
});

test('Save with unchanged text returns focus to Edit', async () => {
  const view = await openEditor();
  await click(view.button('Save'));
  assert.equal(document.activeElement === view.button('Edit'), true);
  await view.unmount();
});
