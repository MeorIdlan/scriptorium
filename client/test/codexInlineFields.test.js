import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { renderApp } from './support/app.js';
import { act, click, flush, press, type } from './support/render.js';
import './support/focus.js';
import CodexView from '../src/pages/CodexView.jsx';

const codex = {
  characters: [{ id: 'ch1', name: 'Mara', flags: [], notes: 'Keeps the lamp lit' }],
  places: [{ id: 'pl1', name: 'Harrowgate', flags: [] }],
  worldRules: [{ id: 'r1', rule: 'Magic costs blood', category: 'magic', flags: [] }],
};

function openCodex(routes = {}) {
  return renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex, ...routes },
  });
}

// The value button for a field, found by the name it is given
const fieldButton = (view, label) => view.queryAll('button.inline-field-value')
  .find((b) => b.getAttribute('aria-label').startsWith(`${label}:`));

const focused = (el) => document.activeElement === el;

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

// Chooses an option the way a change does: the selected option, then a change event
async function choose(select, value) {
  await act(async () => {
    for (const option of select.options) option.selected = option.value === value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
}

test('an inline field names itself and its value, and its input is named by its label', async () => {
  const view = await openCodex();
  await click(view.button('Mara'));
  assert.ok(fieldButton(view, 'Name'));
  assert.equal(fieldButton(view, 'Name').getAttribute('aria-label'), 'Name: Mara');
  assert.equal(fieldButton(view, 'Affiliations').getAttribute('aria-label'), 'Affiliations: empty');
  await click(fieldButton(view, 'Name'));
  assert.equal(view.query('input.inline-field-input').getAttribute('aria-label'), 'Name');
  await view.unmount();
});

test('Enter on a character field saves and returns focus to its value button', async () => {
  const view = await openCodex();
  await click(view.button('Mara'));
  await click(fieldButton(view, 'Name'));
  await type(view.query('input.inline-field-input'), 'Ada');
  await press(view.query('input.inline-field-input'), 'Enter');
  assert.equal(view.query('input.inline-field-input'), null);
  assert.equal(focused(fieldButton(view, 'Name')), true);
  await view.unmount();
});

test('Esc on a character field returns focus to its value button', async () => {
  const view = await openCodex();
  await click(view.button('Mara'));
  await click(fieldButton(view, 'Name'));
  await type(view.query('input.inline-field-input'), 'Ada');
  await press(view.query('input.inline-field-input'), 'Escape');
  assert.equal(focused(fieldButton(view, 'Name')), true);
  // Esc drops the draft: closing the field does not save it
  assert.deepEqual(view.fetch.calls.filter((c) => c.method === 'PUT'), []);
  await view.unmount();
});

test('Esc in a character textarea returns focus to its value button', async () => {
  const view = await openCodex();
  await click(view.button('Mara'));
  await click(fieldButton(view, 'Notes'));
  await press(view.query('textarea.inline-field-textarea'), 'Escape');
  assert.equal(focused(fieldButton(view, 'Notes')), true);
  await view.unmount();
});

test('Enter on a place field saves and returns focus to its value button', async () => {
  const view = await openCodex();
  await click(view.button('Places'));
  await click(view.button('Harrowgate'));
  await click(fieldButton(view, 'Name'));
  await type(view.query('input.inline-field-input'), 'Harrowgate Keep');
  await press(view.query('input.inline-field-input'), 'Enter');
  assert.equal(focused(fieldButton(view, 'Name')), true);
  await view.unmount();
});

test('a category change only picks the option; Enter saves and returns focus', async () => {
  const view = await openCodex();
  await click(view.button('World Rules'));
  await click(view.button('Magic costs blood'));
  await click(fieldButton(view, 'Category'));
  const select = view.query('select.inline-field-select');
  await choose(select, 'politics');
  // A change alone does not close the field: the arrow keys can keep moving
  assert.equal(view.query('select.inline-field-select'), select);
  await press(select, 'Enter');
  assert.equal(view.query('select.inline-field-select'), null);
  assert.equal(focused(fieldButton(view, 'Category')), true);
  await view.unmount();
});

test('Esc on the category select returns focus to its value button', async () => {
  const view = await openCodex();
  await click(view.button('World Rules'));
  await click(view.button('Magic costs blood'));
  await click(fieldButton(view, 'Category'));
  await press(view.query('select.inline-field-select'), 'Escape');
  assert.equal(focused(fieldButton(view, 'Category')), true);
  await view.unmount();
});

test('Enter claims its keypress, so the value button it returns to is not clicked and reopened', async () => {
  const view = await openCodex();
  await click(view.button('Mara'));
  await click(fieldButton(view, 'Name'));
  const event = await keyDownEvent(view.query('input.inline-field-input'), 'Enter');
  assert.equal(event.defaultPrevented, true);
  await view.unmount();
});
