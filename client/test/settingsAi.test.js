import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { toggle, type, click, act, flush } from './support/render.js';
import { renderApp, aiSettings, HttpError } from './support/app.js';
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

// Removing a saved key (card idKTLt3J)
const keyed = (on) => ({
  ...aiSettings(on),
  providers: { anthropic: { hasKey: true, keyPreview: 'sk-ant-1…cdef', model: 'm1' } },
});
const unkeyed = (on) => ({
  ...aiSettings(on),
  providers: { anthropic: { hasKey: false, keyPreview: null, model: 'm1' } },
});
const KEY_ROUTE = 'DELETE /settings/providers/anthropic/key';
const deletes = (view) => view.fetch.calls.filter((c) => c.method === 'DELETE');

async function removeKey(view) {
  await click(view.button('Remove key'));
  await click(view.button('Yes, remove'));
}

test('confirming sends one DELETE for the provider, and saving with a blank key field never does', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': keyed(true), 'PUT /settings': keyed(true), [KEY_ROUTE]: unkeyed(false) },
  });
  await click(view.button('Save Settings'));
  assert.equal(deletes(view).length, 0);
  await click(view.button('Remove key'));
  assert.equal(deletes(view).length, 0);
  await click(view.button('Yes, remove'));
  assert.deepEqual(deletes(view).map((c) => c.path), ['/settings/providers/anthropic/key']);
  await view.unmount();
});

test('after removal the key badge and preview are gone and a toast says so', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': keyed(true), [KEY_ROUTE]: unkeyed(false) },
  });
  assert.match(view.text(), /Key set/);
  assert.equal(view.query('input.form-input').getAttribute('placeholder'), 'sk-ant-1…cdef');
  await removeKey(view);
  assert.doesNotMatch(view.text(), /Key set/);
  assert.equal(view.query('input.form-input').getAttribute('placeholder'), 'sk-ant-…');
  assert.equal(view.hasButton('Remove key'), false);
  assert.match(view.text(), /API key removed/);
  await view.unmount();
});

test('removing the active provider key hides the AI sections without a reload', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': keyed(true), [KEY_ROUTE]: unkeyed(false) },
  });
  assert.match(view.text(), /AI Behaviour/);
  await removeKey(view);
  assert.doesNotMatch(view.text(), /AI Behaviour/);
  assert.equal(aiSwitch(view).checked, false);
  await view.unmount();
});

test('removal clears the model list loaded with the old key', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: {
      'GET /settings': keyed(true),
      'POST /settings/models': { ok: true, models: [{ id: 'm1', name: 'Model One' }] },
      [KEY_ROUTE]: unkeyed(false),
    },
  });
  assert.match(view.text(), /Model One/);
  await removeKey(view);
  assert.doesNotMatch(view.text(), /Model One/);
  await view.unmount();
});

test('removal keeps unsaved edits elsewhere on the page', async () => {
  // The stubbed reply keeps AI on so the slider stays on screen; the page must
  // take only the key fields and the AI state from it, not replace its form
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': { ...keyed(true), generation: { maxTokens: 1000, temperature: 0.7 } }, [KEY_ROUTE]: { ...unkeyed(true), generation: { maxTokens: 1000, temperature: 0.7 } } },
  });
  const slider = () => view.queryAll('input[type="range"]')[0];
  await type(slider(), '2000');
  assert.equal(slider().value, '2000');
  await removeKey(view);
  assert.equal(slider().value, '2000');
  await view.unmount();
});

test('a failed removal shows the error and keeps the key shown', async () => {
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: { 'GET /settings': keyed(true), [KEY_ROUTE]: new HttpError(500, 'SERVER_ERROR', 'Could not remove the key') },
  });
  await removeKey(view);
  assert.match(view.text(), /Could not remove the key/);
  assert.match(view.text(), /Key set/);
  assert.doesNotMatch(view.text(), /API key removed/);
  assert.match(view.text(), /AI Behaviour/);
  await view.unmount();
});

test('an open Remove key question does not follow a switch to another provider', async () => {
  const both = {
    ...aiSettings(true),
    providers: {
      anthropic: { hasKey: true, keyPreview: 'sk-ant-1…cdef', model: 'm1' },
      openai: { hasKey: true, keyPreview: 'sk-open…9999', model: 'm2' },
    },
  };
  const view = await renderApp(h(Settings), {
    ai: true,
    routes: {
      'GET /settings': both,
      'GET /settings/providers': [{ id: 'anthropic', label: 'Anthropic' }, { id: 'openai', label: 'OpenAI' }],
      'POST /settings/models': { ok: true, models: [] },
    },
  });
  await click(view.button('Remove key'));
  assert.ok(view.button('Yes, remove'));
  const select = view.query('select.form-select');
  await act(async () => {
    // linkedom's select.value has no setter: pick the option instead
    select.querySelector('option[value="openai"]').selected = true;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
  assert.equal(view.query('input.form-input').getAttribute('placeholder'), 'sk-open…9999');
  assert.equal(view.hasButton('Yes, remove'), false);
  assert.ok(view.hasButton('Remove key'));
  assert.equal(deletes(view).length, 0);
  await view.unmount();
});
