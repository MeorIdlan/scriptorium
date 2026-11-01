// The work card as a tome (card uqVctsf5): a spine in the work's cover colour, a wax seal on
// completed works, and a shelf board under the grid. Behaviour is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import WorkCard from '../src/components/shelves/WorkCard.jsx';
import WorkGrid from '../src/components/shelves/WorkGrid.jsx';

const work = { id: 'w1', title: 'The Long Road', wordCount: 1200, status: 'active', coverColor: '#2d3b4a' };

const open = (over = {}) => renderApp(h(WorkCard, { work: { ...work, ...over }, onDelete() {}, onExport() {} }));

test('the spine is an ornament carrying the work cover colour', async () => {
  const view = await open();
  const spine = view.query('.work-card-spine');
  assert.ok(spine, 'no spine');
  assert.equal(spine.getAttribute('aria-hidden'), 'true');
  assert.match(spine.getAttribute('style'), /--spine:\s*#2d3b4a/);
  assert.equal(view.query('.work-card-color-swatch'), null, 'the old swatch is gone');
  await view.unmount();
});

test('a work with no cover colour takes the palette accent on its spine', async () => {
  const view = await open({ coverColor: undefined });
  assert.match(view.query('.work-card-spine').getAttribute('style'), /--spine:\s*var\(--accent\)/);
  await view.unmount();
});

test('only a completed work wears the wax seal', async () => {
  const active = await open();
  assert.equal(active.query('.seal'), null);
  await active.unmount();
  const done = await open({ status: 'completed' });
  const seal = done.query('.seal');
  assert.ok(seal, 'no seal on a completed work');
  assert.equal(seal.getAttribute('title'), 'Completed');
  await done.unmount();
});

test('the grid ends in a shelf board when there are works, and not when there are none', async () => {
  const full = await renderApp(h(WorkGrid, { works: [work] }));
  assert.ok(full.query('.shelf-board'));
  await full.unmount();
  const empty = await renderApp(h(WorkGrid, { works: [] }));
  assert.equal(empty.query('.shelf-board'), null);
  await empty.unmount();
});
