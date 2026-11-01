import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { flush } from './support/render.js';
import { renderApp } from './support/app.js';
import { fieldByLabel } from './support/labels.js';
import Settings from '../src/pages/Settings.jsx';

test('the provider, key and model fields are reached through their labels', async () => {
  const view = await renderApp(h(Settings), { ai: false });
  await flush();
  assert.equal(fieldByLabel(view.container, 'Provider').localName, 'select');
  assert.equal(fieldByLabel(view.container, 'API Key').getAttribute('type'), 'password');
  assert.equal(fieldByLabel(view.container, 'Model').localName, 'select');
  await view.unmount();
});

test('with AI on, the two sliders are reached through their labels', async () => {
  const view = await renderApp(h(Settings), { ai: true });
  await flush();
  assert.equal(fieldByLabel(view.container, 'Max Tokens').getAttribute('type'), 'range');
  assert.equal(fieldByLabel(view.container, 'Temperature').getAttribute('type'), 'range');
  await view.unmount();
});

test('the Rekindler choices are a radio group named Rekindler', async () => {
  const view = await renderApp(h(Settings), { ai: true });
  await flush();
  const group = view.queryAll('[role="radiogroup"]')[0];
  assert.ok(group, 'no radiogroup');
  const heading = view.container.querySelector(`[id="${group.getAttribute('aria-labelledby')}"]`);
  assert.equal(heading.textContent, 'Rekindler');
  assert.equal(group.querySelectorAll('input[type="radio"]').length, 3);
  assert.ok(!view.queryAll('label').some((l) => l.textContent === 'Rekindler'));
  await view.unmount();
});
