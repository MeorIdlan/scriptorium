import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush } from './support/render.js';
import './support/focus.js';
import PasskeyManager from '../src/components/settings/PasskeyManager.jsx';

const passkeys = [
  { id: 'pk1', deviceLabel: 'Laptop', createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 'pk2', deviceLabel: 'Phone', createdAt: '2026-10-02T00:00:00.000Z' },
];

// The buttons take the app's .btn styling, so a busy one gets the same look as the rest
test('the passkey buttons are styled as app buttons', async () => {
  const view = await renderApp(h(PasskeyManager), { routes: { 'GET /auth/passkeys': passkeys } });
  await flush();
  assert.equal(view.button('Add a passkey').classList.contains('btn'), true);
  const remove = [...view.container.querySelectorAll('.passkey-list button')];
  assert.equal(remove.length, 2);
  assert.equal(remove.every((b) => b.classList.contains('btn')), true);
  await view.unmount();
});
