import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click, press, act } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import App from '../src/App.jsx';

afterEach(resetViewport);

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
  'GET /works/w1/chapters': [{ id: 'c1', number: 1, title: 'One', wordCount: 1 }],
  'GET /works/w1/chapters/c1': { id: 'c1', content: 'text', contentHtml: '<p>text</p>' },
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'GET /works/w1/threads': [],
  'GET /progress/today': { date: '2026-10-20', words: 0, goal: null },
};

async function open(width) {
  setViewport(width);
  const view = await renderApp(h(App), { routes, path: '/work/w1/chapter/c1', ai: true });
  await flush();
  return view;
}

const panel = (view) => view.query('.right-panel');
const panelButton = (view) => view.query('.word-counter-panel');
const tabs = (view) => view.queryAll('.panel-tab');
const activeTab = (view) => view.query('.panel-tab.active').textContent;

async function openPanel(view) {
  panelButton(view).focus();
  await click(panelButton(view));
}

test('the panel is a right drawer on a tablet and a bottom sheet on a phone, closed at first', async () => {
  const tablet = await open(800);
  assert.match(panel(tablet).className, /\bdrawer--right\b/);
  assert.equal(panel(tablet).hasAttribute('inert'), true);
  await tablet.unmount();
  const phone = await open(390);
  assert.match(panel(phone).className, /\bdrawer--bottom\b/);
  assert.equal(panel(phone).hasAttribute('inert'), true);
  assert.equal(panelButton(phone).getAttribute('aria-controls'), 'drawer-panel');
  assert.equal(panelButton(phone).getAttribute('aria-expanded'), 'false');
  await phone.unmount();
});

test('the Panel button opens it; the close button, Esc and the backdrop close it', async () => {
  const view = await open(390);
  await openPanel(view);
  assert.match(panel(view).className, /\bis-open\b/);
  assert.equal(panelButton(view).getAttribute('aria-expanded'), 'true');
  await click(view.query('.right-panel .drawer-close'));
  assert.doesNotMatch(panel(view).className, /\bis-open\b/);
  await openPanel(view);
  await press(panel(view), 'Escape');
  assert.doesNotMatch(panel(view).className, /\bis-open\b/);
  await openPanel(view);
  await click(view.query('.drawer-backdrop'));
  assert.doesNotMatch(panel(view).className, /\bis-open\b/);
  await view.unmount();
});

test('all four tabs are reachable inside the open panel', async () => {
  const view = await open(800);
  await openPanel(view);
  assert.deepEqual(tabs(view).map((t) => t.textContent.replace(/ ·.*/, '')), ['Quill', 'Scenes', 'Codex', 'Catch']);
  for (const tab of tabs(view)) {
    await click(tab);
    assert.equal(activeTab(view).replace(/ ·.*/, ''), tab.textContent.replace(/ ·.*/, ''));
  }
  await view.unmount();
});

test('closing and reopening the panel keeps the same node and the same tab', async () => {
  const view = await open(390);
  const node = panel(view);
  await openPanel(view);
  await click(tabs(view)[1]);
  await click(view.query('.right-panel .drawer-close'));
  await openPanel(view);
  assert.ok(panel(view) === node, 'the panel element was re-created');
  assert.equal(activeTab(view), 'Scenes');
  await view.unmount();
});

test('Spark on a phone opens the panel on the Quill tab with the hook generator', async () => {
  const view = await open(390);
  await openPanel(view);
  await click(tabs(view)[1]); // Scenes
  await click(view.query('.right-panel .drawer-close'));
  const spark = view.queryAll('.toolbar-spark').find((b) => b.textContent.includes('Spark'));
  await click(spark);
  assert.match(panel(view).className, /\bis-open\b/);
  assert.equal(activeTab(view), 'Quill');
  assert.ok(view.query('.hook-generator'));
  await view.unmount();
});

test('on desktop the panel is exactly the inline panel it was (A4)', async () => {
  const view = await open(1280);
  assert.equal(panel(view).className, 'right-panel');
  for (const name of ['inert', 'role', 'id', 'aria-modal', 'tabindex']) assert.equal(panel(view).hasAttribute(name), false, name);
  assert.equal(panelButton(view), null);
  assert.equal(view.query('.right-panel .drawer-close'), null);
  assert.equal(view.query('.drawer-backdrop'), null);
  await view.unmount();
});

test('Spark opens the generator again after the sheet was closed with the generator open', async () => {
  const view = await open(390);
  const spark = () => view.queryAll('.toolbar-spark').find((b) => b.textContent.includes('Spark'));
  await click(spark());
  assert.ok(view.query('.hook-generator'));
  await click(view.query('.right-panel .drawer-close'));
  await click(spark());
  assert.match(panel(view).className, /\bis-open\b/);
  assert.ok(view.query('.hook-generator'), 'the generator was toggled off instead of shown');
  await view.unmount();
});

// linkedom has no layout, so the measurements the tab indicator reads are stubbed
function stubTabMeasure() {
  const proto = window.HTMLElement.prototype;
  const saved = ['offsetLeft', 'offsetWidth'].map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)]);
  const state = { left: 10, width: 100 };
  Object.defineProperty(proto, 'offsetLeft', { configurable: true, get: () => state.left });
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => state.width });
  return {
    state,
    restore() {
      for (const [name, desc] of saved) {
        if (desc) Object.defineProperty(proto, name, desc);
        else delete proto[name];
      }
    },
  };
}

test('the tab indicator is measured again when the layout mode changes and when a small window resizes', async () => {
  const stub = stubTabMeasure();
  try {
    const view = await open(1280);
    const indicator = () => view.query('.panel-tab-indicator').style.left;
    assert.equal(indicator(), '10px');
    stub.state.left = 50;
    await act(async () => setViewport(390));
    await flush();
    assert.equal(indicator(), '50px', 'not re-measured on a mode change');
    stub.state.left = 70;
    await act(async () => window.dispatchEvent(new window.Event('resize')));
    await flush();
    assert.equal(indicator(), '70px', 'not re-measured on a resize');
    await view.unmount();
  } finally {
    stub.restore();
  }
});
