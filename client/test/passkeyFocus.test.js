import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { act, click, flush } from './support/render.js';
import './support/focus.js';
import PasskeyManager from '../src/components/settings/PasskeyManager.jsx';

let passkeys;
// Replies after a timer tick, as a network request would, so a refresh is visible to the page
const routes = {
  'GET /auth/passkeys': () => new Promise((resolve) => setTimeout(() => resolve(passkeys), 5)),
  'DELETE /auth/passkeys/pk1': () => {
    passkeys = passkeys.filter((p) => p.id !== 'pk1');
    return {};
  },
  'DELETE /auth/passkeys/pk2': () => {
    passkeys = passkeys.filter((p) => p.id !== 'pk2');
    return {};
  },
};

const all = [
  { id: 'pk1', deviceLabel: 'Laptop', createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 'pk2', deviceLabel: 'Phone', createdAt: '2026-10-02T00:00:00.000Z' },
  { id: 'pk3', deviceLabel: 'Tablet', createdAt: '2026-10-03T00:00:00.000Z' },
];

const removeButton = (view, index) => view.queryAll('.passkey-list li button')[index];

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

// Lets the refresh request finish
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
}

// Runs a scenario on a fresh list; unmounts even when an assertion fails
async function scenario(list, run) {
  passkeys = list.map((p) => ({ ...p }));
  const view = await renderApp(h(PasskeyManager), { routes });
  try {
    await flush();
    await run(view);
  } finally {
    await view.unmount();
  }
}

test('removing a passkey moves focus to the next Remove', async () => {
  await scenario(all, async (view) => {
    await pressButton(removeButton(view, 1));
    await settle();
    assert.equal(view.queryAll('.passkey-list li').length, 2);
    assert.equal(document.activeElement === removeButton(view, 1), true);
  });
});

test('removing down to one passkey moves focus to Add a passkey', async () => {
  await scenario(all.slice(0, 2), async (view) => {
    await pressButton(removeButton(view, 0));
    await settle();
    assert.equal(view.queryAll('.passkey-list li').length, 1);
    assert.equal(document.activeElement === view.button('Add a passkey'), true);
  });
});

test('refreshing the list keeps the rows on screen', async () => {
  await scenario(all, async (view) => {
    const other = removeButton(view, 2);
    await pressButton(removeButton(view, 0));
    await settle();
    assert.equal(view.queryAll('.passkey-list li').length, 2);
    assert.equal(view.container.textContent.includes('Loading'), false);
    assert.equal(removeButton(view, 1) === other, true);
  });
});
