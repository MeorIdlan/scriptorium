import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { useLocation } from 'react-router-dom';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import { useUI } from '../src/context/UIContext.jsx';
import ThreadLanes from '../src/components/map/ThreadLanes.jsx';

const heir = { id: 'thr_1', name: 'The missing heir', color: '#c9a96e', status: 'open', order: 0 };
const heist = { id: 'thr_2', name: 'The heist', color: '#5DCAA5', status: 'resolved', order: 1 };

// Ten chapters: the heir runs in chapters 1-2 (a chapter tag and a tagged scene)
// and again in 9; chapters 3-8 are a six-chapter gap.
const chapters = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i + 1}`,
  number: i + 1,
  title: `Chapter ${i + 1}`,
  threadIds: [],
  scenes: [],
}));
chapters[0].threadIds = ['thr_1'];
chapters[1].scenes = [
  { id: 'scn_a', title: 'Arrival', threadIds: [] },
  { id: 'scn_b', title: 'The letter', threadIds: ['thr_1'] },
];
chapters[8].scenes = [{ id: 'scn_c', title: 'Reunion', threadIds: ['thr_1'] }];
chapters[3].threadIds = ['thr_2'];

// Shows where a click ended up
function Probe() {
  const { pathname } = useLocation();
  const { state } = useUI();
  return h('output', { 'data-probe': true }, `${pathname}|${state.pendingScene ? `${state.pendingScene.chapterId}#${state.pendingScene.sceneIndex}` : 'none'}`);
}

function mount({ threads = [heir, heist], chs = chapters } = {}) {
  return renderApp(h('div', null, h(ThreadLanes, { workId: 'w1', threads, chapters: chs }), h(Probe)));
}

const lane = (view, id) => view.query(`[data-thread-id="${id}"]`);

test('shows a hint when the work has no threads', async () => {
  const view = await mount({ threads: [] });
  assert.match(view.text(), /No plot threads yet/);
  assert.equal(view.queryAll('.thread-lane').length, 0);
  await view.unmount();
});

test('draws one lane per thread, labelled with its name', async () => {
  const view = await mount();
  assert.equal(view.queryAll('.thread-lane').length, 2);
  assert.match(lane(view, 'thr_1').textContent, /The missing heir/);
  assert.match(lane(view, 'thr_2').textContent, /The heist/);
  await view.unmount();
});

test('marks a chapter tag with one dot and each tagged scene with its own dot', async () => {
  const view = await mount();
  const dots = [...lane(view, 'thr_1').querySelectorAll('.thread-lane-dot')].map((d) => [d.dataset.chapter, d.dataset.scene ?? '']);
  assert.deepEqual(dots, [['c1', ''], ['c2', '1'], ['c9', '0']]);
  const heistDots = [...lane(view, 'thr_2').querySelectorAll('.thread-lane-dot')].map((d) => d.dataset.chapter);
  assert.deepEqual(heistDots, ['c4']);
  await view.unmount();
});

test('highlights a long untouched stretch and says how long it is', async () => {
  const view = await mount();
  const gaps = [...lane(view, 'thr_1').querySelectorAll('.thread-lane-gap')];
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].getAttribute('title'), 'Untouched for 6 chapters (Ch. 3 to Ch. 8)');
  assert.match(gaps[0].getAttribute('style'), /grid-column:\s*3\s*\/\s*9/);
  await view.unmount();
});

test('does not flag a resolved thread as dropped, and dims its lane', async () => {
  const view = await mount();
  assert.equal(lane(view, 'thr_2').querySelectorAll('.thread-lane-gap').length, 0);
  assert.ok(lane(view, 'thr_2').classList.contains('thread-lane--resolved'));
  await view.unmount();
});

test('a scene dot opens that scene in the editor', async () => {
  const view = await mount();
  assert.equal(view.query('[data-probe]').textContent, '/|none');
  await click(lane(view, 'thr_1').querySelector('[data-chapter="c2"][data-scene="1"]'));
  assert.equal(view.query('[data-probe]').textContent, '/work/w1/chapter/c2|c2#1');
  await view.unmount();
});

test('a chapter dot opens the chapter without picking a scene', async () => {
  const view = await mount();
  await click(lane(view, 'thr_1').querySelector('[data-chapter="c1"]:not([data-scene])'));
  assert.equal(view.query('[data-probe]').textContent, '/work/w1/chapter/c1|none');
  await view.unmount();
});

test('each dot says which chapter and scene it is', async () => {
  const view = await mount();
  const dots = [...lane(view, 'thr_1').querySelectorAll('.thread-lane-dot')].map((d) => d.getAttribute('title'));
  assert.deepEqual(dots, ['Ch. 1: Chapter 1', 'Ch. 2: Chapter 2, The letter', 'Ch. 9: Chapter 9, Reunion']);
  await view.unmount();
});
