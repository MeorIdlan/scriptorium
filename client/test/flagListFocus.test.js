import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { act, click, flush, render } from './support/render.js';
import { stubFetch } from './support/app.js';
import './support/focus.js';
import FlagList from '../src/components/codex/FlagList.jsx';

// Each flag's action sets its status on the "server"; the list shows the unresolved ones
let store;
function resetStore() {
  store = [
    { id: 'f1', note: 'Eyes changed colour', status: 'unresolved' },
    { id: 'f2', note: 'Age conflicts with Ch. 3', status: 'unresolved' },
    { id: 'f3', note: 'Name spelled two ways', status: 'unresolved' },
  ];
}
const routes = Object.fromEntries(
  ['f1', 'f2', 'f3'].map((id) => [
    `PUT /works/w1/codex/flags/${id}`,
    (body) => {
      store.find((f) => f.id === id).status = body.status;
      return { ok: true };
    },
  ])
);

function Harness() {
  const [flags, setFlags] = useState(store.filter((f) => f.status === 'unresolved'));
  return h(FlagList, {
    workId: 'w1',
    flags,
    entityType: 'character',
    entityId: 'c1',
    onFlagsChange: () => setFlags(store.filter((f) => f.status === 'unresolved')),
  });
}

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

const rowButtons = (view, index, label) =>
  [...view.container.querySelectorAll('.flag-item')[index].querySelectorAll('button')].find((b) => b.textContent === label);

// Runs a scenario on a fresh list; unmounts even when an assertion fails
async function scenario(run) {
  resetStore();
  stubFetch(routes);
  const view = await render(h(Harness));
  try {
    await flush();
    await run(view);
  } finally {
    await view.unmount();
  }
}

test('resolving a flag moves focus to the next flag’s first action', async () => {
  await scenario(async (view) => {
    const next = rowButtons(view, 1, 'Keep canonical');
    await pressButton(rowButtons(view, 0, 'Keep canonical'));
    await flush();
    assert.equal(view.container.querySelectorAll('.flag-item').length, 2);
    assert.equal(document.activeElement === next, true);
  });
});

test('resolving the last flag moves focus to the previous flag’s first action', async () => {
  await scenario(async (view) => {
    // Resolve f2 and f3 first, so f1 is the only one left before the last press
    await pressButton(rowButtons(view, 2, 'Ignore'));
    await flush();
    const previous = rowButtons(view, 0, 'Keep canonical');
    await pressButton(rowButtons(view, 1, 'Ignore'));
    await flush();
    assert.equal(view.container.querySelectorAll('.flag-item').length, 1);
    assert.equal(document.activeElement === previous, true);
  });
});

test('a flag action keeps focus while its request runs and sends nothing more', async () => {
  resetStore();
  let release;
  const fetchStub = stubFetch({
    'PUT /works/w1/codex/flags/f1': () =>
      new Promise((resolve) => {
        release = () => {
          store[0].status = 'ignored';
          resolve({ ok: true });
        };
      }),
  });
  const view = await render(h(Harness));
  try {
    await flush();
    const ignore = rowButtons(view, 0, 'Ignore');
    await pressButton(ignore);
    await click(ignore);
    assert.equal(fetchStub.calls.filter((c) => c.method === 'PUT').length, 1);
    assert.equal(document.activeElement === ignore, true);
    await act(async () => release());
    await flush();
  } finally {
    await view.unmount();
  }
});
