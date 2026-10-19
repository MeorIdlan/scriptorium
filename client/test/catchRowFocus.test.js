import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click, press } from './support/render.js';
import './support/focus.js';
import CatchRow from '../src/components/panel/CatchRow.jsx';

const item = { id: 'c1', content: 'A lighthouse keeper', status: 'open', taggedChapterId: null, capturedDuringChapterId: null, createdAt: '2026-10-01T00:00:00.000Z' };

function renderRow() {
  return render(h(CatchRow, { item, chapters: [], showChapter: false, canInsert: false, defaultMapChapterId: null, onAction: async () => true }));
}

const button = (view, label) => [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('Esc in the catch editor returns focus to Edit', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit'));
  await press(view.container.querySelector('.catch-edit-text'), 'Escape');
  assert.equal(document.activeElement === button(view, 'Edit'), true);
  await view.unmount();
});

test('Cancel in the catch editor returns focus to Edit', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit'));
  await click(button(view, 'Cancel'));
  assert.equal(document.activeElement === button(view, 'Edit'), true);
  await view.unmount();
});
