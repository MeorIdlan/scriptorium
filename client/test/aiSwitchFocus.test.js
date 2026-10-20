import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush, toggle } from './support/render.js';
import { renderApp, aiSettings } from './support/app.js';
import './support/focus.js';
import Settings from '../src/pages/Settings.jsx';

function aiSwitch(view) {
  return view.query('input[type="checkbox"]');
}

// The switch's save waits until the test releases it
function heldSave() {
  let release;
  const reply = (body) =>
    new Promise((resolve) => {
      release = () => resolve({ ...aiSettings(body.aiEnabled), aiEnabled: body.aiEnabled });
    });
  return { reply, release: () => release() };
}

test('the AI switch stays focusable while its change saves', async () => {
  const held = heldSave();
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: { 'GET /settings': { ...aiSettings(false), aiAvailable: true }, 'PUT /settings': held.reply },
  });
  const sw = aiSwitch(view);
  sw.focus();
  await toggle(sw, true);
  // A disabled checkbox drops focus; aria-disabled keeps it on the switch
  assert.equal(sw.hasAttribute('disabled'), false);
  assert.equal(sw.getAttribute('aria-disabled'), 'true');
  await act(async () => held.release());
  await flush();
  assert.equal(document.activeElement === aiSwitch(view), true);
  await view.unmount();
});

test('a second toggle while the switch saves sends nothing', async () => {
  const held = heldSave();
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: { 'GET /settings': { ...aiSettings(false), aiAvailable: true }, 'PUT /settings': held.reply },
  });
  await toggle(aiSwitch(view), true);
  await toggle(aiSwitch(view), false);
  assert.equal(view.fetch.calls.filter((c) => c.method === 'PUT' && c.path === '/settings').length, 1);
  await act(async () => held.release());
  await flush();
  await view.unmount();
});
