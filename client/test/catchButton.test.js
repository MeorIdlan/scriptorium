import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click } from './support/render.js';
import { setViewport, setPointer, resetViewport } from './support/viewport.js';
import { ruleIn } from './support/css.js';
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

async function open(width, { path = '/work/w1/chapter/c1', coarse = false } = {}) {
  setViewport(width);
  if (coarse) setPointer('coarse');
  const view = await renderApp(h(App), { routes, path });
  await flush();
  return view;
}

test('at 390px the top bar has a Catch button that opens the Catch panel', async () => {
  const view = await open(390);
  const button = view.query('.topbar-catch');
  assert.ok(button, 'no Catch button in the top bar');
  assert.equal(button.getAttribute('aria-label'), 'Catch an idea');
  assert.ok(view.query('.catch-overlay') === null);
  await click(button);
  assert.ok(view.query('.catch-overlay'), 'the panel did not open');
  await view.unmount();
});

test('at 800px (a tablet) the top bar has the Catch button', async () => {
  const view = await open(800);
  assert.ok(view.query('.topbar-catch'));
  await view.unmount();
});

test('on a desktop with a mouse there is no Catch button, so its layout is unchanged', async () => {
  const view = await open(1280);
  assert.ok(view.query('.topbar-catch') === null);
  await view.unmount();
});

test('on a wide screen with a touch pointer the Catch button shows', async () => {
  const view = await open(1280, { coarse: true });
  assert.ok(view.query('.topbar-catch'));
  await view.unmount();
});

// A catch belongs to a work: with none open the sheet could only sit there and refuse to save
test('there is no Catch button on a page with no work open', async () => {
  const view = await open(390, { path: '/' });
  assert.ok(view.query('.topbar-catch') === null);
  await view.unmount();
});

const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const phone = (selector) => ruleIn(css, '(max-width: 640px)', selector) ?? '';

test('the Catch button is touch size', () => {
  const rule = css.match(/\n\.topbar-catch \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /min-height:\s*44px/);
  assert.match(rule, /min-width:\s*44px/);
});

test('on a phone the Catch panel is a full-width sheet under the top bar with 16px fields', () => {
  const panel = phone('.catch-overlay');
  assert.match(panel, /top:\s*var\(--topbar-height\)/);
  assert.match(panel, /left:\s*0/);
  assert.match(panel, /right:\s*0/);
  assert.match(panel, /width:\s*auto/);
  assert.match(panel, /border-radius:\s*0/);
  assert.match(phone('.catch-overlay-input'), /font-size:\s*16px/);
  assert.match(phone('.catch-chapter-select'), /font-size:\s*16px/);
  assert.match(phone('.catch-overlay-close'), /min-width:\s*44px/);
});
