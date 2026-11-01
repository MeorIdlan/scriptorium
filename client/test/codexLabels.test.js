import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import { fieldByLabel } from './support/labels.js';
import CodexView from '../src/pages/CodexView.jsx';

const codex = { characters: [], places: [], worldRules: [] };

function openCodex() {
  return renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex },
  });
}

test('the New Character dialog labels its name field', async () => {
  const view = await openCodex();
  await click(view.button('+ Add'));
  const field = fieldByLabel(document.body, 'Character name');
  assert.equal(field.localName, 'input');
  await view.unmount();
});

test('the New Place dialog labels its name field', async () => {
  const view = await openCodex();
  await click(view.button('Places'));
  await click(view.button('+ Add'));
  assert.equal(fieldByLabel(document.body, 'Place name').localName, 'input');
  await view.unmount();
});

test('the New World Rule dialog labels its Category and Rule fields', async () => {
  const view = await openCodex();
  await click(view.button('World Rules'));
  await click(view.button('+ Add'));
  assert.equal(fieldByLabel(document.body, 'Category').localName, 'select');
  assert.equal(fieldByLabel(document.body, 'Rule').localName, 'textarea');
  await view.unmount();
});
