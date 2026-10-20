import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import CodexView from '../src/pages/CodexView.jsx';

// Resolving a flag refetches the whole Codex; the page must stay up while it does
let flags;
const codex = () => ({
  characters: [{ id: 'ch1', name: 'Mara', flags }],
  places: [],
  worldRules: [],
});

test('resolving a flag keeps the Codex on screen and focus on the next flag', async () => {
  flags = [
    { id: 'f1', note: 'Eyes changed colour', status: 'unresolved' },
    { id: 'f2', note: 'Age conflicts', status: 'unresolved' },
  ];
  const view = await renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: {
      'GET /works/w1/codex': codex,
      'PUT /works/w1/codex/flags/f1': () => {
        flags = flags.map((f) => (f.id === 'f1' ? { ...f, status: 'canonical' } : f));
        return { ok: true };
      },
    },
  });
  try {
    await flush();
    await click(view.button('Mara'));
    await flush();
    const next = view.queryAll('.flag-item')[1].querySelector('button');
    const first = view.queryAll('.flag-item')[0].querySelector('button');
    first.focus();
    await click(first);
    // The refresh is a second request after the flag's; let both finish
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    assert.equal(view.text().includes('Loading codex'), false);
    assert.equal(view.queryAll('.flag-item').length, 1);
    assert.equal(document.activeElement === next, true);
  } finally {
    await view.unmount();
  }
});
