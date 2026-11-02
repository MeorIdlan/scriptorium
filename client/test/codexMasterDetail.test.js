// On phones and tablets the Codex shows the list or one entry, with a Back button between them
// (card xkCkHLPZ, FR-25). Desktop keeps its three columns and its exact markup.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { click, flush, type } from './support/render.js';
import { renderApp } from './support/app.js';
import { setViewport, resetViewport } from './support/viewport.js';
import { ruleIn } from './support/css.js';
import './support/focus.js';
import CodexView from '../src/pages/CodexView.jsx';

afterEach(resetViewport);

const codex = () => ({
  characters: [
    { id: 'ch1', name: 'Mara', flags: [] },
    { id: 'ch2', name: 'Ilse', flags: [] },
  ],
  places: [{ id: 'p1', name: 'Harrowgate', flags: [] }],
  worldRules: [],
});

async function open(width) {
  setViewport(width);
  const view = await renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: { 'GET /works/w1/codex': codex },
  });
  await flush();
  return view;
}

const root = (view) => view.query('.codex-view');
const inDetail = (view) => root(view).classList.contains('codex-view--detail');

test('at 390px picking an entry shows its detail with a Back button that has focus', async () => {
  const view = await open(390);
  assert.equal(inDetail(view), false);
  assert.ok(view.query('.codex-back') === null);
  await click(view.button('Mara'));
  await flush();
  assert.equal(inDetail(view), true);
  const back = view.query('.codex-back');
  assert.ok(back, 'no Back button');
  assert.match(back.textContent, /Back to list/);
  assert.equal(document.activeElement === back, true);
  await view.unmount();
});

test('Back returns to the list and focus lands on the entry that was open', async () => {
  const view = await open(390);
  await click(view.button('Ilse'));
  await flush();
  await click(view.query('.codex-back'));
  await flush();
  assert.equal(inDetail(view), false);
  assert.ok(view.query('.codex-back') === null);
  assert.equal(document.activeElement === view.button('Ilse'), true);
  await view.unmount();
});

test('switching tab returns to the list', async () => {
  const view = await open(390);
  await click(view.button('Mara'));
  await flush();
  await click(view.button('Places'));
  await flush();
  assert.equal(inDetail(view), false);
  await view.unmount();
});

test('at 800px (a tablet) it is the same master-detail', async () => {
  const view = await open(800);
  await click(view.button('Mara'));
  await flush();
  assert.equal(inDetail(view), true);
  assert.ok(view.query('.codex-back'));
  await view.unmount();
});

test('on a desktop the markup is unchanged: no Back button, no detail class', async () => {
  const view = await open(1280);
  await click(view.button('Mara'));
  await flush();
  assert.equal(root(view).className, 'codex-view');
  assert.ok(view.query('.codex-back') === null);
  assert.ok(view.query('.codex-list-col') && view.query('.codex-detail-col') && view.query('.codex-flags-col'));
  await view.unmount();
});

const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const compact = (selector) => ruleIn(css, '(max-width: 1099px)', selector) ?? '';

test('below 1100px the Codex is one scrolling column that shows the list or the detail', () => {
  assert.match(compact('.codex-view'), /flex-direction:\s*column/);
  assert.match(compact('.codex-view'), /overflow-y:\s*auto/);
  assert.match(compact('.codex-list-col'), /width:\s*100%/);
  assert.match(compact('.codex-flags-col'), /width:\s*100%/);
  assert.match(compact('.codex-view--detail .codex-list-col'), /display:\s*none/);
  assert.match(compact('.codex-view--detail .codex-flags-col'), /display:\s*none/);
  assert.match(compact('.codex-detail-col'), /display:\s*none/);
  assert.match(compact('.codex-view--detail .codex-detail-col'), /display:\s*block/);
});

test('the Codex list rows, tabs and Back button are touch size below 1100px', () => {
  assert.match(compact('.codex-entity-item'), /min-height:\s*44px/);
  assert.match(compact('.codex-tabs .codex-tab'), /min-height:\s*44px/);
  assert.match(compact('.codex-back'), /min-height:\s*44px/);
});

test('the tab indicator is measured again when the width changes', async () => {
  const view = await open(390);
  const active = view.query('.codex-tab.active');
  Object.defineProperty(active, 'offsetLeft', { configurable: true, get: () => 100 });
  Object.defineProperty(active, 'offsetWidth', { configurable: true, get: () => 120 });
  window.dispatchEvent(new window.Event('resize'));
  await flush();
  const indicator = view.query('.codex-tab-indicator');
  assert.equal(indicator.style.left, '100px');
  assert.equal(indicator.style.width, '120px');
  await view.unmount();
});

test('adding a rule on a phone opens it with focus on Back, not on a hidden button', async () => {
  setViewport(390);
  const view = await renderApp(h(CodexView), {
    path: '/work/w1/codex',
    route: '/work/:workId/codex',
    routes: {
      'GET /works/w1/codex': codex,
      'POST /works/w1/codex/rules': (body) => ({ id: 'r1', flags: [], ...body }),
    },
  });
  await flush();
  await click(view.button('World Rules'));
  await click(view.button('+ Add'));
  await flush();
  await type(view.query('textarea'), 'Lamps burn only for liars.');
  await click(view.button('Add Rule'));
  await flush();
  assert.equal(inDetail(view), true);
  assert.equal(document.activeElement === view.query('.codex-back'), true);
  await view.unmount();
});
