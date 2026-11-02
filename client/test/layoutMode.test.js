import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { render, act, flush } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
import { ruleIn } from './support/css.js';
import { PHONE_MAX, TABLET_MAX, LAYOUT_QUERIES, modeForWidth } from '../src/utils/layoutMode.js';
import { useLayoutMode } from '../src/hooks/useLayoutMode.js';

afterEach(resetViewport);

function Probe() {
  return h('span', { id: 'mode' }, useLayoutMode());
}

async function mode() {
  const view = await render(h(Probe));
  return { view, text: () => view.container.querySelector('#mode').textContent };
}

test('the layout-mode breakpoints are 640 and 1099', () => {
  assert.equal(PHONE_MAX, 640);
  assert.equal(TABLET_MAX, 1099);
  assert.equal(LAYOUT_QUERIES.phone, '(max-width: 640px)');
  assert.equal(LAYOUT_QUERIES.tablet, '(min-width: 641px) and (max-width: 1099px)');
});

test('modeForWidth puts 640 in phone, 641 and 1099 in tablet, 1100 in desktop', () => {
  assert.equal(modeForWidth(640), 'phone');
  assert.equal(modeForWidth(641), 'tablet');
  assert.equal(modeForWidth(1099), 'tablet');
  assert.equal(modeForWidth(1100), 'desktop');
});

test('media queries use the layout-mode numbers', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const allowed = new Set([PHONE_MAX, PHONE_MAX + 1, TABLET_MAX, TABLET_MAX + 1]);
  const numbers = [];
  for (const [, query] of css.matchAll(/@media\s+([^{]+)\{/g)) {
    for (const [, n] of query.matchAll(/(?:min|max)-width:\s*(\d+)px/g)) numbers.push(Number(n));
  }
  assert.ok(numbers.length > 0);
  for (const n of numbers) assert.ok(allowed.has(n), `unexpected media query width ${n}px`);
});

test('useLayoutMode follows the viewport width', async () => {
  setViewport(390);
  const { text } = await mode();
  assert.equal(text(), 'phone');
  await act(async () => setViewport(800));
  await flush();
  assert.equal(text(), 'tablet');
  await act(async () => setViewport(1280));
  await flush();
  assert.equal(text(), 'desktop');
});

test('useLayoutMode is desktop when matchMedia is missing', async () => {
  resetViewport();
  const { text } = await mode();
  assert.equal(text(), 'desktop');
});

test('useLayoutMode does not ask matchMedia again on every render', async () => {
  setViewport(390);
  const make = window.matchMedia;
  let calls = 0;
  window.matchMedia = (query) => {
    calls += 1;
    return make(query);
  };
  const view = await render(h(Probe));
  for (let i = 0; i < 5; i++) await view.rerender(h(Probe));
  assert.ok(calls <= 4, `matchMedia was called ${calls} times`);
  await view.unmount();
});

test('the editor gets less side padding on tablets (28px 24px) and phones (20px 16px)', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(ruleIn(css, '(max-width: 1099px)', '.editor-wrap') ?? '', /padding:\s*28px 24px/);
  assert.match(ruleIn(css, '(max-width: 640px)', '.editor-wrap') ?? '', /padding:\s*20px 16px/);
});

test('the compact word counter keeps the desktop bar\'s centred text', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const rule = ruleIn(css, '(max-width: 1099px)', '.word-counter') ?? '';
  assert.match(rule, /display:\s*flex/);
  assert.doesNotMatch(rule, /text-align:\s*left/);
});

test('the compact layout clips what the closed drawers leave outside it, so nothing can scroll it sideways', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(ruleIn(css, '(max-width: 1099px)', '.layout') ?? '', /overflow:\s*clip/);
});
