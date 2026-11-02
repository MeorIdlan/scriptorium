// The Map's curve, chapter blocks and beat row scroll sideways together inside one area, so a long
// work can't push the whole Map (and its title) off the screen (card Ml85iCei, FR-25)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush } from './support/render.js';
import { ruleIn } from './support/css.js';
import MapView from '../src/pages/MapView.jsx';

const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const body = (selector) => css.match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
const phone = (selector) => ruleIn(css, '(max-width: 640px)', selector) ?? '';

async function openMap(count) {
  const chapters = Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`, number: i + 1, title: `Chapter ${i + 1}`, wordCount: 1000, scenes: [],
  }));
  const view = await renderApp(h(MapView), {
    path: '/work/w1/map',
    route: '/work/:workId/map',
    routes: {
      'GET /works/w1': { id: 'w1', title: 'Book' },
      'GET /works/w1/chapters': chapters,
      'GET /works/w1/map': { chapters: {} },
      'GET /works/w1/threads': [],
    },
  });
  await flush();
  return view;
}

test('the curve, the blocks and the beat row sit inside one scroll area', async () => {
  const view = await openMap(30);
  const timeline = view.query('.map-timeline');
  assert.ok(timeline, 'no .map-timeline');
  for (const selector of ['.map-curve-section', '.chapter-blocks', '.beat-row']) {
    assert.ok(timeline.querySelector(selector), `${selector} is outside .map-timeline`);
  }
  assert.equal(view.queryAll('.map-view > .beat-row').length, 0);
  await view.unmount();
});

test('the scroll area is as wide as the chapters need', async () => {
  const view = await openMap(30);
  assert.match(view.query('.map-timeline-inner').getAttribute('style'), /--chapters:\s*30/);
  await view.unmount();
});

test('the timeline is the only thing that scrolls sideways', () => {
  assert.match(body('.map-timeline'), /overflow-x:\s*auto/);
  assert.match(body('.map-timeline-inner'), /min-width:\s*max\(100%,\s*calc\(var\(--chapters/);
  assert.ok(!/overflow-x/.test(body('.chapter-blocks-wrap')), 'the blocks must not scroll apart from the curve');
  assert.ok(!/overflow-x/.test(body('.map-view')), '.map-view must not scroll sideways');
});

test('a short work still fills the card, so a desktop Map looks the same', () => {
  // min-width is a floor, not a width: below it the inner box is just the full width
  assert.ok(!/(^|[^-])width:/.test(body('.map-timeline-inner')), 'no fixed width on the inner box');
});

test('on a phone the Map has narrower padding and a stacked header', () => {
  assert.match(phone('.map-view'), /padding:\s*16px/);
  assert.match(phone('.map-header'), /flex-direction:\s*column/);
});
