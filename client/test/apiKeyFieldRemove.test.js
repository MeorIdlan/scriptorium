import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click, press, type, act, flush } from './support/render.js';
import './support/focus.js';
import { fieldByLabel } from './support/labels.js';
import ApiKeyField from '../src/components/settings/ApiKeyField.jsx';

const noop = () => {};

function field(props = {}) {
  return h(ApiKeyField, {
    hasKey: true,
    keyPreview: 'sk-ant-1…cdef',
    onChange: noop,
    onTest: noop,
    onSave: noop,
    onRemove: noop,
    ...props,
  });
}

const buttons = (view) => [...view.container.querySelectorAll('button')];
const button = (view, text) => buttons(view).find((b) => b.textContent === text);
const active = () => window.document.activeElement;

// A promise the test settles by hand, so a request can be "in flight"
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

test('Remove key shows only with a saved key, an empty input and a remove handler', async () => {
  const view = await render(field());
  assert.ok(button(view, 'Remove key'));
  await view.rerender(field({ hasKey: false }));
  assert.equal(button(view, 'Remove key'), undefined);
  await view.rerender(field({ onRemove: undefined }));
  assert.equal(button(view, 'Remove key'), undefined);
  await view.rerender(field());
  await type(fieldByLabel(view.container, 'API Key'), 'sk-new');
  assert.equal(button(view, 'Remove key'), undefined);
  await view.unmount();
});

test('the first click asks to confirm and removes nothing', async () => {
  const calls = [];
  const view = await render(field({ onRemove: async () => calls.push('remove') }));
  await click(button(view, 'Remove key'));
  assert.match(view.container.textContent, /Remove key\?/);
  assert.ok(button(view, 'Yes, remove'));
  assert.ok(button(view, 'Cancel'));
  assert.equal(button(view, 'Remove key'), undefined);
  assert.deepEqual(calls, []);
  // The button that was clicked is gone, so focus lands on the safe choice
  assert.equal(active(), button(view, 'Cancel'));
  await view.unmount();
});

test('Cancel puts the Remove key button back, sends nothing and returns focus to it', async () => {
  const calls = [];
  const view = await render(field({ onRemove: async () => calls.push('remove') }));
  await click(button(view, 'Remove key'));
  await click(button(view, 'Cancel'));
  assert.ok(button(view, 'Remove key'));
  assert.equal(button(view, 'Yes, remove'), undefined);
  assert.equal(active(), button(view, 'Remove key'));
  assert.deepEqual(calls, []);
  await view.unmount();
});

test('Esc cancels the confirmation the same way', async () => {
  const calls = [];
  const view = await render(field({ onRemove: async () => calls.push('remove') }));
  await click(button(view, 'Remove key'));
  await press(button(view, 'Yes, remove'), 'Escape');
  assert.ok(button(view, 'Remove key'));
  assert.equal(active(), button(view, 'Remove key'));
  assert.deepEqual(calls, []);
  await view.unmount();
});

test('Yes, remove sends one request, and a second click while it runs sends none', async () => {
  const request = deferred();
  const calls = [];
  const view = await render(
    field({
      onRemove: () => {
        calls.push('remove');
        return request.promise;
      },
    })
  );
  await click(button(view, 'Remove key'));
  await click(button(view, 'Yes, remove'));
  await click(button(view, 'Yes, remove'));
  assert.deepEqual(calls, ['remove']);
  await act(async () => request.resolve());
  await flush();
  await view.unmount();
});

test('once the key is gone the Remove key button is gone and focus moves to the key input', async () => {
  const request = deferred();
  const view = await render(field({ onRemove: () => request.promise }));
  await click(button(view, 'Remove key'));
  await click(button(view, 'Yes, remove'));
  // The parent applies the reply, then the request settles
  await view.rerender(field({ hasKey: false, keyPreview: null, onRemove: () => request.promise }));
  await act(async () => request.resolve());
  await flush();
  assert.equal(button(view, 'Remove key'), undefined);
  assert.equal(button(view, 'Yes, remove'), undefined);
  assert.equal(active(), fieldByLabel(view.container, 'API Key'));
  await view.unmount();
});

test('a failed removal leaves the key in place and returns focus to Remove key', async () => {
  // The page reports the error itself, so the request settles and hasKey stays true
  const view = await render(field({ onRemove: async () => {} }));
  await click(button(view, 'Remove key'));
  await click(button(view, 'Yes, remove'));
  assert.ok(button(view, 'Remove key'));
  assert.equal(button(view, 'Yes, remove'), undefined);
  assert.equal(active(), button(view, 'Remove key'));
  await view.unmount();
});

test('Cancel does nothing while the removal request is running', async () => {
  const request = deferred();
  const calls = [];
  const view = await render(
    field({
      onRemove: () => {
        calls.push('remove');
        return request.promise;
      },
    })
  );
  await click(button(view, 'Remove key'));
  await click(button(view, 'Yes, remove'));
  await click(button(view, 'Cancel'));
  // Still asking, so the outcome is not hidden from the writer
  assert.ok(button(view, 'Yes, remove'));
  assert.deepEqual(calls, ['remove']);
  await act(async () => request.resolve());
  await flush();
  assert.ok(button(view, 'Remove key'));
  await view.unmount();
});

test('while removing, Yes, remove and Cancel read as busy and stay focusable', async () => {
  const view = await render(field({ removing: true }));
  await click(button(view, 'Remove key'));
  for (const el of [button(view, 'Removing…'), button(view, 'Cancel')]) {
    assert.equal(el.getAttribute('aria-disabled'), 'true');
    assert.equal(el.hasAttribute('disabled'), false);
  }
  await view.unmount();
});
