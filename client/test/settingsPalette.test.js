// The palette selector in Settings (card uqVctsf5): native radios at the top of the
// page, applied at once, saved on their own, and put back if the save fails.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click } from './support/render.js';
import { renderApp, aiSettings, HttpError } from './support/app.js';
import { CACHE_KEY } from '../src/utils/palette.js';
import Settings from '../src/pages/Settings.jsx';

const attr = () => document.documentElement.dataset.palette;
const cached = () => localStorage.getItem(CACHE_KEY);
const radios = (view) => view.queryAll('input[type="radio"][name="palette"]');
const radio = (view, value) => radios(view).find((r) => r.getAttribute('value') === value);

beforeEach(() => {
  delete document.documentElement.dataset.palette;
  localStorage.removeItem(CACHE_KEY);
});

function open(palette, put) {
  return renderApp(h(Settings), {
    ai: false,
    routes: {
      'GET /settings': { ...aiSettings(false), palette },
      'PUT /settings': put ?? ((body) => ({ ...aiSettings(false), palette: body.palette })),
    },
  });
}

test('Settings starts with an Appearance section holding three palette radios, the account palette checked', async () => {
  const view = await open('nave');
  const first = view.queryAll('.settings-section')[0];
  assert.equal(first.querySelector('h2').textContent, 'Appearance');
  assert.deepEqual(radios(view).map((r) => r.getAttribute('value')), ['votive', 'nave', 'reliquary']);
  assert.deepEqual(radios(view).map((r) => r.checked), [false, true, false]);
  assert.equal(attr(), 'nave', 'the account palette is applied');
  await view.unmount();
});

test('the palette radios are one labelled radio group with a visible name each', async () => {
  const view = await open('votive');
  const group = view.query('[role="radiogroup"][aria-labelledby]');
  assert.ok(group, 'no labelled radiogroup');
  // useId ids contain colons, so match the attribute instead of using #id
  const heading = view.container.querySelector(`[id="${group.getAttribute('aria-labelledby')}"]`);
  assert.ok(heading && heading.textContent.trim(), 'the group heading is missing');
  const labels = radios(view).map((r) => r.closest('label').textContent);
  assert.match(labels[0], /Votive/);
  assert.match(labels[1], /Nave/);
  assert.match(labels[2], /Reliquary/);
  await view.unmount();
});

test('each palette card shows its own colours: it carries data-palette and a four-swatch strip', async () => {
  const view = await open('votive');
  const cards = view.queryAll('.pick-card');
  assert.deepEqual(cards.map((c) => c.getAttribute('data-palette')), ['votive', 'nave', 'reliquary']);
  for (const card of cards) {
    assert.equal(card.querySelectorAll('.pick-strip i').length, 4, 'strip of four swatches');
    assert.equal(card.querySelector('.pick-strip').getAttribute('aria-hidden'), 'true');
    assert.ok(card.querySelector('input[type="radio"]'), 'the card is still a native radio');
  }
  await view.unmount();
});

test('choosing a palette applies it at once and saves only palette', async () => {
  const view = await open('votive');
  await click(radio(view, 'reliquary'));
  assert.equal(attr(), 'reliquary');
  assert.equal(cached(), 'reliquary');
  const puts = view.fetch.calls.filter((c) => c.method === 'PUT' && c.path === '/settings');
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].body, { palette: 'reliquary' });
  assert.equal(radio(view, 'reliquary').checked, true);
  assert.equal(radio(view, 'votive').checked, false);
  await view.unmount();
});

test('a failed save restores the previous palette and shows the error', async () => {
  const view = await open('nave', () => new HttpError(500, 'SERVER_ERROR', 'Could not save'));
  await click(radio(view, 'reliquary'));
  assert.equal(attr(), 'nave', 'the old palette is back');
  assert.equal(cached(), 'nave', 'the cache never took the failed choice');
  assert.equal(radio(view, 'nave').checked, true);
  assert.equal(radio(view, 'reliquary').checked, false);
  assert.match(view.query('.settings-error').textContent, /Could not save/);
  await view.unmount();
});
