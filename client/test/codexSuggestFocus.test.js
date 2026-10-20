import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import CodexSuggestPanel from '../src/components/codex/CodexSuggestPanel.jsx';

const entity = { id: 'ch1', name: 'Mara' };
const suggestions = { suggestions: [{ field: null, text: 'Fake suggestion.' }], context: null };

function renderPanel(routes = {}) {
  return renderApp(h(CodexSuggestPanel, { workId: 'w1', entityType: 'character', entity }), {
    ai: true,
    routes: { 'POST /ai/codex-suggest': suggestions, ...routes },
  });
}

// A keyboard press focuses the button before its click
async function press(el) {
  el.focus();
  await click(el);
}

test('the first suggestions move focus to Dismiss', async () => {
  const view = await renderPanel();
  await press(view.button('AI Suggestions'));
  await flush();
  assert.equal(document.activeElement === view.query('.codex-suggest-dismiss'), true);
  await view.unmount();
});

test('Dismiss returns focus to AI Suggestions', async () => {
  const view = await renderPanel();
  await press(view.button('AI Suggestions'));
  await flush();
  await press(view.query('.codex-suggest-dismiss'));
  assert.equal(document.activeElement === view.button('AI Suggestions'), true);
  await view.unmount();
});

test('Regenerate keeps focus on Regenerate while the request runs', async () => {
  let calls = 0;
  let release;
  const view = await renderPanel({
    'POST /ai/codex-suggest': () => {
      calls += 1;
      return calls === 1 ? suggestions : new Promise((r) => (release = r));
    },
  });
  await press(view.button('AI Suggestions'));
  await flush();
  const regenerate = view.button('Regenerate');
  await press(regenerate);
  assert.equal(document.activeElement === regenerate, true);
  assert.equal(regenerate.getAttribute('aria-disabled'), 'true');
  await act(async () => release(suggestions));
  await flush();
  assert.equal(document.activeElement === regenerate, true);
  await view.unmount();
});
