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
  assert.ok(view.query('.settings-page') === page, 'page was remounted');
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
  const put = view.fetch.calls.find((c) => c.method === 'PUT' && c.path === '/settings');
  assert.equal(put?.body.providers?.anthropic?.apiKey, 'sk-test');
  assert.match(view.text(), /AI Behaviour/);
  await view.unmount();
});

function withSavedKey(settings) {
  return { ...settings, providers: { anthropic: { hasKey: true, model: 'm1' } } };
}

test('with AI off, opening Settings does not ask the provider for models', async () => {
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: { 'GET /settings': withSavedKey(aiSettings(false)), 'POST /settings/models': { ok: true, models: [] } },
  });
  assert.equal(view.fetch.calls.some((c) => c.path === '/settings/models'), false);
  await view.unmount();
});

test('with AI on, opening Settings loads the models for the saved key', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': withSavedKey(aiSettings(true)), 'POST /settings/models': { ok: true, models: [] } },
  });
  assert.ok(view.fetch.calls.some((c) => c.path === '/settings/models'));
  await view.unmount();
});

test('Settings shares the AI state it loads with the rest of the app', async () => {
  // Only the first read succeeds, so the page and the app-wide state can only
  // agree if the page passes on what it loaded
  let reads = 0;
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: {
      'GET /settings': () => {
        reads += 1;
        if (reads > 1) throw new Error('down');
        return aiSettings(true);
      },
    },
  });
  assert.equal(aiSwitch(view).checked, true);
  assert.match(view.text(), /AI Behaviour/);
  await view.unmount();
});

test('turning AI on loads the models for the saved key', async () => {
  const view = await renderApp(h(Settings), {
    ai: false,
    routes: {
      'GET /settings': withSavedKey({ ...aiSettings(false), aiAvailable: true }),
      'PUT /settings': withSavedKey(aiSettings(true)),
      'POST /settings/models': { ok: true, models: [{ id: 'm1', name: 'Model One' }] },
    },
  });
  await toggle(aiSwitch(view), true);
  assert.ok(view.fetch.calls.some((c) => c.path === '/settings/models'));
  assert.match(view.text(), /Model One/);
  await view.unmount();
});
