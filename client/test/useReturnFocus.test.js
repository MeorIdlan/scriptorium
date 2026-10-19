import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useRef, useState } from 'react';
import { render, act, flush } from './support/render.js';
import './support/focus.js';
import { useReturnFocus } from '../src/hooks/useReturnFocus.js';

// The editor replaces the button while it is open, as in the components that use
// the hook. `api` exposes the state changes a test makes inside act()
function Harness({ api }) {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const button = useRef(null);
  const returnFocus = useReturnFocus();
  Object.assign(api, { open: setOpen, bump: () => bump((n) => n + 1), returnFocus, button });
  return h('div', null,
    h('input', { id: 'other' }),
    open
      ? h('input', { id: 'editor' })
      : h('button', { ref: button, id: 'opener' }, 'Open'));
}

async function mount() {
  const api = {};
  const view = await render(h(Harness, { api }));
  const opener = () => view.container.querySelector('#opener');
  const focused = (el) => document.activeElement === el;
  return { api, view, opener, focused };
}

test('returns focus to the target when focus was lost with the editor', async () => {
  const { api, view, opener, focused } = await mount();
  await act(async () => api.open(true));
  await act(async () => {
    api.returnFocus(api.button);
    api.open(false);
  });
  await flush();
  assert.equal(focused(opener()), true);
  await view.unmount();
});

test('does not take focus from an element the writer moved to', async () => {
  const { api, view, focused } = await mount();
  await act(async () => api.open(true));
  view.container.querySelector('#other').focus();
  await act(async () => {
    api.returnFocus(api.button);
    api.open(false);
  });
  await flush();
  assert.equal(focused(view.container.querySelector('#other')), true);
  await view.unmount();
});

test('waits until the target is rendered, then focuses it', async () => {
  const { api, view, opener, focused } = await mount();
  await act(async () => api.open(true));
  await act(async () => api.returnFocus(api.button));
  // Still editing: the button is not on screen, so focus does not move yet
  await act(async () => api.bump());
  assert.equal(focused(opener()), false);
  await act(async () => api.open(false));
  await flush();
  assert.equal(focused(opener()), true);
  await view.unmount();
});

test('clearing the target with null means a later close does not move focus', async () => {
  const { api, view, opener, focused } = await mount();
  await act(async () => api.open(true));
  await act(async () => {
    api.returnFocus(api.button);
    api.returnFocus(null);
    api.open(false);
  });
  await flush();
  assert.equal(focused(opener()), false);
  await view.unmount();
});
