import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush, press, type } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import CodexView from '../src/pages/CodexView.jsx';

const codex = {
  characters: [{ id: 'ch1', name: 'Mara', flags: [] }],
  places: [{ id: 'pl1', name: 'Harrowgate', flags: [] }],
  worldRules: [{ id: 'r1', rule: 'Magic costs blood', category: 'magic', flags: [] }],
};

function openCodex(ai) {
  return renderApp(h(CodexView), {
    ai,
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex },
  });
}

// Opens each kind of entry in turn and reports whether it offered AI suggestions
async function suggestionsPerEntry(view) {
  const seen = {};
  for (const [tab, entry] of [['Characters', 'Mara'], ['Places', 'Harrowgate'], ['World Rules', 'Magic costs blood']]) {
    await click(view.button(tab));
    await click(view.button(entry));
    seen[tab] = view.hasButton('AI Suggestions');
  }
  return seen;
}

test('with AI off the Codex has no audit and no suggestions', async () => {
  const view = await openCodex(false);
  assert.equal(view.hasButton('Codex Audit'), false);
  assert.doesNotMatch(view.text(), /AI Assist/);
  assert.deepEqual(await suggestionsPerEntry(view), { Characters: false, Places: false, 'World Rules': false });
  assert.deepEqual(view.fetch.aiCalls(), []);
  await view.unmount();
});

test('with AI off Codex entries still open for editing', async () => {
  const view = await openCodex(false);
  await click(view.button('Mara'));
  assert.ok(view.query('.codex-entity-item.active'));
  await view.unmount();
});

test('with AI on the Codex offers the audit and suggestions on every entry', async () => {
  const view = await openCodex(true);
  assert.ok(view.hasButton('Codex Audit'));
  assert.deepEqual(await suggestionsPerEntry(view), { Characters: true, Places: true, 'World Rules': true });
  await view.unmount();
});

// Presses a key and returns the event, so the test can read defaultPrevented
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

test('Enter in the add-entry name field confirms and claims the key, so the opener is not clicked again', async () => {
  const view = await openCodex(false);
  await click(view.button('+ Add'));
  const input = view.query('.modal input');
  await type(input, 'Ada');
  const event = await keyDownEvent(input, 'Enter');
  assert.equal(event.defaultPrevented, true);
  assert.equal(view.query('[role="dialog"]'), null);
  await view.unmount();
});

test('the character, place and rule fields are buttons, so the keyboard can open them', async () => {
  const view = await openCodex(false);
  const tabs = { Harrowgate: 'Places', 'Magic costs blood': 'World Rules' };
  for (const entry of ['Mara', 'Harrowgate', 'Magic costs blood']) {
    if (tabs[entry]) await click(view.button(tabs[entry]));
    await click(view.button(entry));
    const fields = view.queryAll('.inline-field-value');
    assert.ok(fields.length > 0, `${entry} shows editable fields`);
    for (const field of fields) assert.equal(field.tagName, 'BUTTON', `${entry} field is a button`);
  }
  await view.unmount();
});

test('the add-entry dialog opens focused on its name field and stays open on a click inside it', async () => {
  const view = await openCodex(false);
  await click(view.button('+ Add'));
  assert.equal(document.activeElement === view.query('.modal input'), true);
  await click(view.query('.modal-body'));
  assert.ok(view.query('[role="dialog"]'));
  await view.unmount();
});

test('the add-entry dialog is a labelled dialog, and Esc on its name field closes it', async () => {
  const view = await openCodex(false);
  await click(view.button('+ Add'));
  assert.ok(view.query('[role="dialog"]'));
  await press(view.query('.modal input'), 'Escape');
  assert.equal(view.query('[role="dialog"]'), null);
  await view.unmount();
});
