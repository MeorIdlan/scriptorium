import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click, flush, type } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import NewWorkWizard from '../src/components/shelves/NewWorkWizard.jsx';

const hooks = ['A stranger knocks at midnight.', 'The map was never drawn.', 'The bell rings once more.'];

async function toReview(view) {
  await type(view.query('input.form-input'), 'The Long Road');
  await click(view.button('Next'));
  await click(view.button('Next'));
  assert.match(view.text(), /Review/);
}

async function openWithHooks() {
  const view = await renderApp(h(NewWorkWizard, { onClose() {} }), {
    ai: true,
    routes: { 'POST /ai/hooks': { hooks, context: null } },
  });
  await toReview(view);
  const generate = view.button('Generate Opening Hooks');
  generate.focus();
  await click(generate);
  await flush();
  return view;
}

test('each opening hook is a button a keyboard can choose', async () => {
  const view = await openWithHooks();
  const cards = view.queryAll('.wizard-hook-card');
  assert.equal(cards.length, 3);
  assert.equal(cards.every((card) => card.tagName === 'BUTTON'), true);
  await click(cards[1]);
  assert.equal(cards[1].getAttribute('aria-pressed'), 'true');
  assert.equal(cards[0].getAttribute('aria-pressed'), 'false');
  await view.unmount();
});

test('generating hooks moves focus to the first hook', async () => {
  const view = await openWithHooks();
  assert.equal(document.activeElement === view.queryAll('.wizard-hook-card')[0], true);
  await view.unmount();
});
