import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click, press, type } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
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

test('the wizard opens focused on its title field', async () => {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }), { ai: false });
  assert.equal(document.activeElement === view.query('input.form-input'), true);
  await view.unmount();
});

test('the wizard is a labelled dialog, and Esc on a field inside it closes it', async () => {
  let closed = 0;
  const view = await renderApp(h(NewWorkWizard, { onClose() { closed++; } }), { ai: false });
  const dialog = view.query('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-labelledby'), view.query('.modal-title').id);
  assert.equal(view.query('.modal-title').textContent, 'New Work');
  await press(view.query('input.form-input'), 'Escape');
  assert.equal(closed, 1);
  await view.unmount();
});
