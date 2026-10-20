import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click, press, type } from './support/render.js';
import './support/focus.js';
import CatchRow from '../src/components/panel/CatchRow.jsx';

const item = { id: 'c1', content: 'A lighthouse keeper', status: 'open', taggedChapterId: null, capturedDuringChapterId: null, createdAt: '2026-10-01T00:00:00.000Z' };

function renderRow(onAction = async () => ({ ok: true })) {
  return render(h(CatchRow, { item, chapters: [], showChapter: false, canInsert: false, defaultMapChapterId: null, onAction }));
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

test('Enter in the catch editor saves and returns focus to Edit', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit'));
  const text = view.container.querySelector('.catch-edit-text');
  await type(text, 'A lighthouse keeper, revised');
  await press(text, 'Enter');
  assert.equal(view.container.querySelector('.catch-edit-text'), null);
  assert.equal(document.activeElement === button(view, 'Edit'), true);
  await view.unmount();
});

test('Save in the catch editor returns focus to Edit', async () => {
  const view = await renderRow();
  await click(button(view, 'Edit'));
  await type(view.container.querySelector('.catch-edit-text'), 'A lighthouse keeper, revised');
  await click(button(view, 'Save'));
  assert.equal(document.activeElement === button(view, 'Edit'), true);
  await view.unmount();
});

test('a refused edit keeps the editor open with focus in it', async () => {
  const view = await renderRow(async () => ({ ok: false, stage: 'edit', message: 'Could not save' }));
  await click(button(view, 'Edit'));
  const text = view.container.querySelector('.catch-edit-text');
  await type(text, 'A lighthouse keeper, revised');
  await press(text, 'Enter');
  assert.equal(view.container.querySelector('.catch-edit-text') === text, true);
  assert.equal(document.activeElement === text, true);
  await view.unmount();
});

test('Use as… Cancel returns focus to Use as…', async () => {
  const view = await renderRow();
  await click(button(view, 'Use as…'));
  await click(button(view, 'Cancel'));
  assert.equal(document.activeElement === button(view, 'Use as…'), true);
  await view.unmount();
});

test('Use as… Save returns focus to Use as…', async () => {
  const view = await renderRow();
  await click(button(view, 'Use as…'));
  await click(button(view, 'Save'));
  assert.equal(document.activeElement === button(view, 'Use as…'), true);
  await view.unmount();
});
