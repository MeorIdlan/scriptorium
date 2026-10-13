import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { useLocation } from 'react-router-dom';
import { renderApp } from './support/app.js';
import { click, toggle } from './support/render.js';
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

// --- show / hide lanes ---

const KEY = 'scriptorium.hiddenLanes.w1';

// Swaps globalThis.localStorage for the test, whatever the runtime provides
function withStorage(store, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...store });
  const restore = () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  };
  return Promise.resolve(fn()).finally(restore);
}

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  const value = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  return { store: { value, writable: true }, data };
}

const showBox = (view, id) => lane(view, id).querySelector('input[type="checkbox"]');

test('every lane starts shown, with a checkbox to hide it', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const view = await mount();
    assert.equal(showBox(view, 'thr_1').getAttribute('aria-label'), 'Show The missing heir');
    assert.equal(showBox(view, 'thr_1').checked, true);
    assert.equal(showBox(view, 'thr_2').checked, true);
    await view.unmount();
  });
});

test('unchecking a lane hides its marks but keeps its label and checkbox', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const view = await mount();
    await toggle(showBox(view, 'thr_1'), false);
    assert.equal(lane(view, 'thr_1').querySelectorAll('.thread-lane-dot').length, 0);
    assert.equal(lane(view, 'thr_1').querySelectorAll('.thread-lane-gap').length, 0);
    assert.match(lane(view, 'thr_1').textContent, /The missing heir/);
    assert.equal(showBox(view, 'thr_1').checked, false);
    assert.equal(lane(view, 'thr_2').querySelectorAll('.thread-lane-dot').length, 1);
    await toggle(showBox(view, 'thr_1'), true);
    assert.equal(lane(view, 'thr_1').querySelectorAll('.thread-lane-dot').length, 3);
    await view.unmount();
  });
});

test('the hidden lanes are remembered per work', async () => {
  const { store, data } = memoryStore();
  await withStorage(store, async () => {
    const first = await mount();
    await toggle(showBox(first, 'thr_1'), false);
    assert.equal(data.get(KEY), JSON.stringify(['thr_1']));
    await first.unmount();

    const again = await mount();
    assert.equal(showBox(again, 'thr_1').checked, false);
    assert.equal(lane(again, 'thr_1').querySelectorAll('.thread-lane-dot').length, 0);
    await again.unmount();
  });
});

test('another work keeps its own lanes', async () => {
  const { store } = memoryStore({ 'scriptorium.hiddenLanes.w2': JSON.stringify(['thr_1']) });
  await withStorage(store, async () => {
    const view = await mount();
    assert.equal(showBox(view, 'thr_1').checked, true);
    await view.unmount();
  });
});

test('a damaged saved value is ignored', async () => {
  const { store } = memoryStore({ [KEY]: '{not json' });
  await withStorage(store, async () => {
    const view = await mount();
    assert.equal(showBox(view, 'thr_1').checked, true);
    await view.unmount();
  });
});

test('lanes still show and hide when storage is blocked', async () => {
  await withStorage({ get() { throw new Error('denied'); } }, async () => {
    const view = await mount();
    assert.equal(showBox(view, 'thr_1').checked, true);
    await toggle(showBox(view, 'thr_1'), false);
    assert.equal(lane(view, 'thr_1').querySelectorAll('.thread-lane-dot').length, 0);
    await view.unmount();
  });
});

// --- open at the end ---

const endItems = (view) => view.queryAll('.thread-open-end-item');

test('lists the open threads that are not touched in the last chapter', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const view = await mount();
    assert.equal(endItems(view).length, 1);
    assert.match(endItems(view)[0].textContent, /The missing heir/);
    assert.match(endItems(view)[0].textContent, /last touched in Ch\. 9/);
    await view.unmount();
  });
});

test('says so when a thread was never touched', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const lonely = { id: 'thr_3', name: 'The curse', color: '#7F77DD', status: 'open', order: 2 };
    const view = await mount({ threads: [lonely] });
    assert.match(endItems(view)[0].textContent, /never touched/);
    await view.unmount();
  });
});

test('says none when every open thread reaches the last chapter', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const reaching = chapters.map((c, i) => (i === 9 ? { ...c, threadIds: ['thr_1'] } : c));
    const view = await mount({ chs: reaching });
    assert.equal(endItems(view).length, 0);
    assert.match(view.query('.thread-open-end').textContent, /None/);
    await view.unmount();
  });
});

test('leaves a hidden lane out of the open-at-the-end list', async () => {
  const { store } = memoryStore();
  await withStorage(store, async () => {
    const view = await mount();
    await toggle(showBox(view, 'thr_1'), false);
    assert.equal(endItems(view).length, 0);
    assert.match(view.query('.thread-open-end').textContent, /None/);
    await view.unmount();
  });
});

test('shows no open-at-the-end section when there are no threads', async () => {
  const view = await mount({ threads: [] });
  assert.equal(view.query('.thread-open-end'), null);
  await view.unmount();
});

// --- chapter ruler and scrolling ---

test('a ruler above the lanes numbers every chapter in the same columns', async () => {
  const view = await mount();
  const ruler = view.query('.thread-lane-ruler');
  assert.ok(ruler, 'ruler is shown');
  assert.deepEqual([...ruler.querySelectorAll('.thread-lane-ruler-num')].map((n) => n.textContent), chapters.map((c) => String(c.number)));
  assert.match(view.query('.thread-lane-ruler-track').getAttribute('style'), /repeat\(10,/);
  await view.unmount();
});

test('the lanes scroll sideways instead of squeezing the marks in a long book', async () => {
  const view = await mount();
  const grid = view.query('.thread-lane-grid');
  assert.match(grid.getAttribute('style'), /min-width:\s*\d+px/);
  assert.ok(view.query('.thread-lane-scroll .thread-lane-grid'));
  await view.unmount();
});

test('there is no ruler when no thread exists', async () => {
  const view = await mount({ threads: [] });
  assert.equal(view.query('.thread-lane-ruler'), null);
  await view.unmount();
});
