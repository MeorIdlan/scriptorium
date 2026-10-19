import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, render, click, flush, press, type } from './support/render.js';
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

test('a rename the server refuses keeps the field open with focus in it', async () => {
  const view = await renderRow({ onSave: async () => false });
  await click(button(view, 'Lighthouse'));
  const input = view.container.querySelector('.thread-name-input');
  await type(input, 'Beacon');
  await press(input, 'Enter');
  assert.equal(view.container.querySelector('.thread-name-input') === input, true);
  assert.equal(document.activeElement === input, true);
  await view.unmount();
});

// Presses a key and returns the event, so a test can read defaultPrevented
async function keyDownEvent(el, key) {
  let event;
  await act(async () => {
    event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    el.dispatchEvent(event);
  });
  await flush();
  return event;
}

test('Enter in the rename field claims its keypress, so the name button is not clicked and reopened', async () => {
  const view = await renderRow();
  await click(button(view, 'Lighthouse'));
  const event = await keyDownEvent(view.container.querySelector('.thread-name-input'), 'Enter');
  assert.equal(event.defaultPrevented, true);
  await view.unmount();
});
