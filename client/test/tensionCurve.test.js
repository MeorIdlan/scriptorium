// The tension curve is drawn 1:1 with the chapter blocks wherever the Map scrolls sideways, so
// each dot sits over its block and nothing is stretched (review of card xkCkHLPZ, FR-25). A short
// work on a desktop keeps the 900-unit curve it always had.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
import TensionCurve from '../src/components/map/TensionCurve.jsx';

afterEach(resetViewport);

const chapters = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, number: i + 1, tensionScore: 50 }));

async function draw(n, width) {
  if (width) setViewport(width);
  const view = await render(h(TensionCurve, { chapters: chapters(n) }));
  const svg = view.container.querySelector('svg');
  const cx = [...view.container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
  return { view, viewBox: svg.getAttribute('viewBox'), cx, style: svg.getAttribute('style') || '' };
}

test('a long work is drawn one pixel to a unit, each dot over its chapter block', async () => {
  // 74px a chapter (a 68px block and a 6px gap); the first block's centre is 42px in
  const { view, viewBox, cx, style } = await draw(30);
  assert.equal(viewBox, '0 0 2230 120');
  assert.equal(cx[0], 42);
  assert.equal(cx[1], 116);
  assert.equal(cx[29], 42 + 74 * 29);
  assert.match(style, /width:\s*2230px/);
  await view.unmount();
});

test('on a phone even a short work is drawn 1:1, because its blocks already scroll', async () => {
  const { view, viewBox, cx, style } = await draw(5, 390);
  assert.equal(viewBox, '0 0 380 120');
  assert.equal(cx[0], 42);
  assert.equal(cx[4], 42 + 74 * 4);
  assert.match(style, /width:\s*380px/);
  await view.unmount();
});

test('on a tablet too', async () => {
  const { view, viewBox } = await draw(10, 800);
  assert.equal(viewBox, '0 0 750 120');
  await view.unmount();
});

test('a short work on a desktop keeps the 900-unit curve it always had', async () => {
  for (const n of [5, 15]) {
    const { view, viewBox, cx, style } = await draw(n);
    assert.equal(viewBox, '0 0 900 120', `${n} chapters`);
    assert.equal(cx[0], 24);
    assert.equal(cx[n - 1], 876);
    assert.equal(style, '');
    await view.unmount();
  }
});

test('a desktop switches to the 1:1 drawing at 16 chapters, where its timeline starts to scroll', async () => {
  const { view, viewBox } = await draw(16);
  assert.equal(viewBox, '0 0 1194 120');
  await view.unmount();
});
