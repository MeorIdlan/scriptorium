import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { toggle, type, click } from './support/render.js';
import { renderApp, aiSettings } from './support/app.js';
import Settings from '../src/pages/Settings.jsx';

function aiSwitch(view) {
  return view.query('input[type="checkbox"]');
}

test('with AI off, Settings shows only the provider section and the switch', async () => {
  const view = await renderApp(h(Settings), { ai: false });
  assert.match(view.text(), /AI Provider/);
  assert.match(view.text(), /AI features/);
  assert.doesNotMatch(view.text(), /Generation Parameters/);
  assert.doesNotMatch(view.text(), /AI Behaviour/);
  await view.unmount();
});

test('with AI on, Settings shows generation and AI behaviour sections', async () => {
  const view = await renderApp(h(Settings), { ai: true });
  assert.match(view.text(), /Generation Parameters/);
  assert.match(view.text(), /AI Behaviour/);
  await view.unmount();
});

test('turning AI on shows the AI sections without a reload', async () => {
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: {
      'GET /settings': { ...aiSettings(false), aiAvailable: true },
      'PUT /settings': (body) => ({ ...aiSettings(true), aiEnabled: body.aiEnabled }),
    },
  });
  // The page is up before the switch flips: it isn't remounted
  const page = view.query('.settings-page');
  assert.doesNotMatch(view.text(), /AI Behaviour/);
  await toggle(aiSwitch(view), true);
  assert.match(view.text(), /AI Behaviour/);
  assert.equal(view.query('.settings-page'), page);
  await toggle(aiSwitch(view), false);
  assert.doesNotMatch(view.text(), /AI Behaviour/);
  await view.unmount();
});

test('saving the first key turns AI on everywhere', async () => {
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: { 'PUT /settings': aiSettings(true) },
  });
  assert.doesNotMatch(view.text(), /AI Behaviour/);
  await type(view.query('input.form-input'), 'sk-test');
  await click(view.button('Save'));
  assert.match(view.text(), /AI Behaviour/);
  await view.unmount();
});
