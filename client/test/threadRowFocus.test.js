import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click, press, type } from './support/render.js';
import './support/focus.js';
import ThreadRow from '../src/components/map/ThreadRow.jsx';

const thread = { id: 't1', name: 'Lighthouse', color: '#7fa7d9', status: 'open', description: 'The beam' };

function renderRow(overrides = {}) {
  return render(h(ThreadRow, {
    thread,
    tagCount: 0,
    onSave: async () => true,
    onDelete() {},
    onCancel() {},
    ...overrides,
  }));
}

const button = (view, label) => [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('Esc in the rename field returns focus to the name button', async () => {
  const view = await renderRow();
  const name = button(view, 'Lighthouse');
  name.focus();
  await click(name);
  await press(view.container.querySelector('.thread-name-input'), 'Escape');
  assert.equal(document.activeElement === button(view, 'Lighthouse'), true);
  await view.unmount();
});

test('Enter in the rename field with no change returns focus to the name button', async () => {
  const view = await renderRow();
  await click(button(view, 'Lighthouse'));
  await press(view.container.querySelector('.thread-name-input'), 'Enter');
  assert.equal(document.activeElement === button(view, 'Lighthouse'), true);
  await view.unmount();
});

test('Esc in the description field returns focus to the description button', async () => {
  const view = await renderRow();
  await click(button(view, 'The beam'));
  await press(view.container.querySelector('.thread-desc-input'), 'Escape');
  assert.equal(document.activeElement === button(view, 'The beam'), true);
  await view.unmount();
});

test('Delete opens the confirmation with focus on Cancel, and Cancel returns focus to Delete', async () => {
  const view = await renderRow();
  await click(button(view, 'Delete'));
  assert.equal(document.activeElement === button(view, 'Cancel'), true);
  await click(button(view, 'Cancel'));
  assert.equal(document.activeElement === button(view, 'Delete'), true);
  await view.unmount();
});
