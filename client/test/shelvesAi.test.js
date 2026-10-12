import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click, type } from './support/render.js';
import { renderApp } from './support/app.js';
import NewWorkWizard from '../src/components/shelves/NewWorkWizard.jsx';

async function toReview(view) {
  await type(view.query('input.form-input'), 'The Long Road');
  await click(view.button('Next'));
  await click(view.button('Next'));
  assert.match(view.text(), /Review/);
}

test('with AI off the wizard offers no opening hooks', async () => {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }), { ai: false });
  await toReview(view);
  assert.equal(view.hasButton('Generate Opening Hooks'), false);
  await view.unmount();
});

test('with AI off the wizard still creates the work', async () => {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }), {
    ai: false,
    routes: { 'POST /works': (body) => ({ id: 'w9', ...body }) },
  });
  await toReview(view);
  await click(view.button('Create Work'));
  const created = view.fetch.calls.find((c) => c.method === 'POST' && c.path === '/works');
  assert.equal(created?.body.title, 'The Long Road');
  assert.deepEqual(view.fetch.aiCalls(), []);
  await view.unmount();
});

test('with AI on the wizard offers opening hooks', async () => {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }), { ai: true });
  await toReview(view);
  assert.ok(view.hasButton('Generate Opening Hooks'));
  await view.unmount();
});
