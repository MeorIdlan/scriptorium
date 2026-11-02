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
  // The page has more than one radio group (the palette comes first), so find this one by its heading
  const headingOf = (g) => view.container.querySelector(`[id="${g.getAttribute('aria-labelledby')}"]`);
  const group = view.queryAll('[role="radiogroup"]').find((g) => headingOf(g)?.textContent === 'Rekindler');
  assert.ok(group, 'no radiogroup named Rekindler');
  const heading = headingOf(group);
  assert.equal(heading.textContent, 'Rekindler');
  assert.equal(group.querySelectorAll('input[type="radio"]').length, 3);
  assert.ok(!view.queryAll('label').some((l) => l.textContent === 'Rekindler'));
  await view.unmount();
});
