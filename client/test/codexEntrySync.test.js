import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { act, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import CharacterSheet from '../src/components/codex/CharacterSheet.jsx';

// The Codex refetches after a flag resolves; the sheet must show the new data
let setCharacter;
function Harness({ first }) {
  const [character, set] = useState(first);
  setCharacter = set;
  return h(CharacterSheet, { workId: 'w1', character, onUpdate() {}, onFlagsChange() {} });
}

const withFlags = (flags) => ({
  id: 'ch1',
  name: 'Mara',
  flags,
  aliases: [],
  notes: '',
});

test('a refetched character shows its current flags', async () => {
  const view = await renderApp(h(Harness, { first: withFlags([{ id: 'f1', note: 'Eyes changed colour', status: 'unresolved' }]) }));
  try {
    await flush();
    assert.equal(view.queryAll('.flag-item').length, 1);
    await act(async () =>
      setCharacter(withFlags([{ id: 'f1', note: 'Eyes changed colour', status: 'canonical' }]))
    );
    await flush();
    assert.equal(view.queryAll('.flag-item').length, 0);
  } finally {
    await view.unmount();
  }
});
