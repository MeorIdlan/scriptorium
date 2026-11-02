// The tension curve is drawn 1:1 with the chapter blocks once there are enough chapters to need
// scrolling, so a long work's curve isn't stretched sideways (review of card xkCkHLPZ, FR-25)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from './support/render.js';
import TensionCurve from '../src/components/map/TensionCurve.jsx';

const chapters = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, number: i + 1, tensionScore: 50 }));

async function draw(n) {
  const view = await render(h(TensionCurve, { chapters: chapters(n) }));
  const svg = view.container.querySelector('svg');
  const cx = [...view.container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
  return { view, viewBox: svg.getAttribute('viewBox'), cx };
}

test('a long work is drawn one pixel to a unit, each dot over its chapter block', async () => {
  const { view, viewBox, cx } = await draw(30);
  // 74px a chapter (a 68px block and a 6px gap); the first block's centre is 42px in
  assert.equal(viewBox, '0 0 2230 120');
  assert.equal(cx[0], 42);
  assert.equal(cx[1], 116);
  assert.equal(cx[29], 42 + 74 * 29);
  await view.unmount();
});

test('a short work keeps the 900-unit curve it always had', async () => {
  const { view, viewBox, cx } = await draw(5);
  assert.equal(viewBox, '0 0 900 120');
  assert.equal(cx[0], 24);
  assert.equal(cx[4], 876);
  await view.unmount();
});
