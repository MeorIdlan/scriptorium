import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import './support/focus.js';
import Toolbar from '../src/components/editor/Toolbar.jsx';
import RightPanel from '../src/components/panel/RightPanel.jsx';

// Spark sits in the toolbar and the generator opens in the Quill tab, so the
// two are rendered together
const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', wordCount: 1200 },
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One', wordCount: 1200, summaryStatus: 'none' }],
  'GET /works/w1/sessions/latest': {},
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'POST /ai/hooks': { hooks: ['Fake hook one.', 'Fake hook two.', 'Fake hook three.'], context: null },
};

async function openSpark() {
  const view = await renderApp(h(Fragment, null, h(Toolbar, { editorRef: { current: null } }), h(RightPanel, { workId: 'w1' })), {
    ai: true,
    path: '/work/w1',
    route: '/work/:workId',
    routes,
  });
  return view;
}

// A keyboard press focuses the button before its click
async function press(el) {
  el.focus();
  await click(el);
}

const byText = (view, text) => view.queryAll('button').find((b) => b.textContent.trim() === text);

test('Spark brings the Quill tab forward when another tab is showing', async () => {
  const view = await openSpark();
  await press(byText(view, 'Scenes'));
  await press(view.button('Spark'));
  assert.equal(view.query('.panel-tab.active').textContent, 'Quill');
  assert.ok(view.query('.hook-generator'));
  await view.unmount();
});

test('closing the generator returns focus to Spark', async () => {
  const view = await openSpark();
  await press(view.button('Spark'));
  await press(view.query('.hook-generator-close'));
  assert.equal(view.query('.hook-generator'), null);
  assert.equal(document.activeElement === view.button('Spark'), true);
  await view.unmount();
});

test('generating moves focus to the first hook', async () => {
  const view = await openSpark();
  await press(view.button('Spark'));
  await press(view.button('Generate 3 Hooks'));
  await flush();
  assert.equal(document.activeElement === byText(view, 'Use this hook'), true);
  await view.unmount();
});

test('Try again returns focus to Generate', async () => {
  const view = await openSpark();
  await press(view.button('Spark'));
  await press(view.button('Generate 3 Hooks'));
  await flush();
  await press(byText(view, 'Try again'));
  assert.equal(document.activeElement === view.button('Generate 3 Hooks'), true);
  await view.unmount();
});

test('Spark with the generator open behind another tab only brings the Quill tab forward', async () => {
  const view = await openSpark();
  await press(view.button('Spark'));
  assert.ok(view.query('.hook-generator'));
  await press(byText(view, 'Scenes'));
  assert.equal(view.query('.hook-generator'), null);
  await press(view.button('Spark'));
  // The generator is still open: Spark shows it again and does not close it
  assert.equal(view.query('.panel-tab.active').textContent, 'Quill');
  assert.ok(view.query('.hook-generator'));
  await view.unmount();
});

