import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import { ThreadChips, ThreadMarkers, ChapterThreads } from '../src/components/panel/ThreadChips.jsx';
import SceneRow from '../src/components/panel/SceneRow.jsx';

const threads = [
  { id: 'thr_1', name: 'The missing heir', color: '#c9a96e', status: 'open' },
  { id: 'thr_2', name: 'Storm', color: '#7fa7d9', status: 'resolved' },
];

test('chips show every thread, mark the selected ones and toggle on click', async () => {
  const toggled = [];
  const view = await renderApp(h(ThreadChips, { threads, selected: ['thr_1'], onToggle: (id) => toggled.push(id), label: 'Threads' }));
  const chips = view.queryAll('.thread-chip');
  assert.equal(chips.length, 2);
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  assert.equal(chips[1].getAttribute('aria-pressed'), 'false');
  await click(chips[1]);
  assert.deepEqual(toggled, ['thr_2']);
  await view.unmount();
});

test('markers are coloured per thread, named in the tooltip, and skip unknown ids', async () => {
  const view = await renderApp(h(ThreadMarkers, { threads, ids: ['thr_2', 'thr_gone', 'thr_1'] }));
  const marks = view.queryAll('.thread-marker');
  assert.deepEqual(marks.map((m) => m.getAttribute('title')), ['Storm', 'The missing heir']);
  assert.match(marks[0].getAttribute('style'), /#7fa7d9/);
  await view.unmount();
});

test('the chapter strip hints at the Map when the work has no threads', async () => {
  const view = await renderApp(h(ChapterThreads, { threads: [], selected: [], onToggle() {}, busy: false, error: '' }));
  assert.match(view.text(), /Define plot threads on the Map/);
  assert.equal(view.queryAll('.thread-chip').length, 0);
  await view.unmount();
});

test('the chapter strip shows a save error and disables chips while busy', async () => {
  const view = await renderApp(h(ChapterThreads, { threads, selected: [], onToggle() {}, busy: true, error: 'Could not save' }));
  assert.match(view.text(), /Could not save/);
  assert.ok(view.queryAll('.thread-chip').every((c) => c.disabled));
  await view.unmount();
});

const scene = { id: 'scn_a', index: 0, title: 'Arrival', pov: '', location: '', status: 'draft', summary: '', wordCount: 10, threadIds: ['thr_1'], marker: null };

function mountRow(onSave) {
  return renderApp(h('ul', null, h(SceneRow, { scene, threads, current: false, characters: [], places: [], onJump() {}, onSave, onRemove() {}, busy: false })));
}

test('a scene row shows its thread markers', async () => {
  const view = await mountRow(() => {});
  assert.deepEqual(view.queryAll('.thread-marker').map((m) => m.getAttribute('title')), ['The missing heir']);
  await view.unmount();
});

test('the scene card sets and clears tags and saves them with the card', async () => {
  const saved = [];
  const view = await mountRow((fields) => saved.push(fields));
  await click(view.button('Edit card'));
  const chips = view.queryAll('.scene-card-form .thread-chip');
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  await click(chips[0]); // clear thr_1
  await click(chips[1]); // set thr_2
  await click(view.button('Save'));
  assert.deepEqual(saved[0].threadIds, ['thr_2']);
  await view.unmount();
});
