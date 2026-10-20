import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import CharacterSheet from '../src/components/codex/CharacterSheet.jsx';
import PlaceEntry from '../src/components/codex/PlaceEntry.jsx';

// Resolving the entry's only flag refetches it with no flags left
const flag = { id: 'f1', note: 'Eyes changed colour', status: 'unresolved' };
let setEntry;

function Harness({ kind, first }) {
  const [entry, set] = useState(first);
  setEntry = set;
  const onFlagsChange = () => set({ ...first, flags: [] });
  if (kind === 'character') {
    return h(CharacterSheet, { workId: 'w1', character: entry, onUpdate() {}, onFlagsChange });
  }
  return h(PlaceEntry, { workId: 'w1', place: entry, onUpdate() {}, onFlagsChange });
}

const cases = [
  ['character', { id: 'ch1', name: 'Mara', flags: [flag], aliases: [], notes: '' }],
  ['place', { id: 'pl1', name: 'Harrowgate', flags: [flag], description: '', notes: '' }],
];

for (const [kind, first] of cases) {
  test(`resolving the last flag on a ${kind} returns focus to its Name`, async () => {
    const view = await renderApp(h(Harness, { kind, first }), { ai: false });
    try {
      await flush();
      const name = view.query('button[aria-label^="Name:"]');
      const keep = view.query('.flag-item button');
      keep.focus();
      await click(keep);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
      assert.equal(view.queryAll('.flag-item').length, 0);
      assert.equal(document.activeElement === name, true);
    } finally {
      await view.unmount();
    }
  });
}
