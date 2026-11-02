// The writer's palette (card uqVctsf5): validated names, a cache that never throws,
// an early script that paints the right palette, and the sync from the settings read.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { act } from './support/render.js';
import { renderApp } from './support/app.js';
import { useAiState } from '../src/context/AiContext.jsx';
import {
  PALETTES,
  DEFAULT_PALETTE,
  CACHE_KEY,
  isPalette,
  readCachedPalette,
  rememberPalette,
  applyPalette,
  syncPalette,
} from '../src/utils/palette.js';

const here = dirname(fileURLToPath(import.meta.url));

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

// Swaps globalThis.localStorage for the test, whatever the runtime provides
function withStorage(store, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const restore = () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  let result;
  try {
    result = run();
  } catch (err) {
    restore();
    throw err;
  }
  // An async run keeps the store until it settles
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
}

const throwingStore = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

const attr = () => document.documentElement.dataset.palette;

beforeEach(() => {
  delete document.documentElement.dataset.palette;
});

test('the palette names and defaults', () => {
  assert.deepEqual(PALETTES, ['votive', 'nave', 'reliquary']);
  assert.equal(DEFAULT_PALETTE, 'votive');
  assert.equal(CACHE_KEY, 'scriptorium.palette');
  assert.equal(isPalette('nave'), true);
  assert.equal(isPalette('gold'), false);
  assert.equal(isPalette(undefined), false);
});

test('readCachedPalette gives votive for missing, empty and unknown values', () => {
  for (const value of [undefined, '', 'gold']) {
    const store = memoryStore(value === undefined ? {} : { [CACHE_KEY]: value });
    assert.equal(withStorage(store, () => readCachedPalette()), 'votive', `cached ${JSON.stringify(value)}`);
  }
  assert.equal(withStorage(memoryStore({ [CACHE_KEY]: 'reliquary' }), () => readCachedPalette()), 'reliquary');
});

test('readCachedPalette and rememberPalette do not throw when localStorage throws', () => {
  withStorage(throwingStore, () => {
    assert.equal(readCachedPalette(), 'votive');
    assert.doesNotThrow(() => rememberPalette('nave'));
    applyPalette('nave');
    assert.equal(attr(), 'nave', 'the palette still applies for the session');
  });
});

test('rememberPalette stores only known names', () => {
  const store = memoryStore();
  withStorage(store, () => {
    rememberPalette('nave');
    rememberPalette('gold');
  });
  assert.equal(store.data[CACHE_KEY], 'nave');
});

test('applyPalette sets the attribute and falls back to votive for an unknown name', () => {
  applyPalette('reliquary');
  assert.equal(attr(), 'reliquary');
  applyPalette('gold');
  assert.equal(attr(), 'votive');
});

test('syncPalette applies and caches a valid account palette', () => {
  const store = memoryStore();
  withStorage(store, () => syncPalette('nave'));
  assert.equal(attr(), 'nave');
  assert.equal(store.data[CACHE_KEY], 'nave');
});

test('syncPalette ignores undefined and unknown values', () => {
  const store = memoryStore({ [CACHE_KEY]: 'nave' });
  document.documentElement.dataset.palette = 'nave';
  withStorage(store, () => {
    syncPalette(undefined);
    syncPalette('gold');
    syncPalette(null);
  });
  assert.equal(attr(), 'nave');
  assert.equal(store.data[CACHE_KEY], 'nave');
});

// The early script in index.html, run against fakes
function earlyScript() {
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, 'index.html needs exactly one inline script');
  return inline[0];
}

test('index.html early script uses the same names and key', () => {
  const code = earlyScript();
  const names = [...code.match(/\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, PALETTES);
  assert.equal(code.match(/getItem\('([^']+)'\)/)[1], CACHE_KEY);
});

test('index.html early script comes before the module bundle', () => {
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('<script>') < html.indexOf('type="module"'), 'the inline script must run first');
});

function runEarly(store) {
  const fakeDoc = { documentElement: { dataset: {} } };
  new Function('localStorage', 'document', earlyScript())(store, fakeDoc);
  return fakeDoc.documentElement.dataset.palette;
}

test('index.html early script applies a cached palette and ignores bad ones', () => {
  assert.equal(runEarly(memoryStore({ [CACHE_KEY]: 'nave' })), 'nave');
  assert.equal(runEarly(memoryStore({ [CACHE_KEY]: 'gold' })), undefined);
  assert.equal(runEarly(memoryStore()), undefined);
  assert.doesNotThrow(() => runEarly(throwingStore));
});

let ai;
function Probe() {
  ai = useAiState();
  return h('p', null, 'probe');
}

test('AiContext applies the account palette from the settings read', async () => {
  const store = memoryStore();
  await withStorage(store, async () => {
    const view = await renderApp(h(Probe), {
      ai: true,
      routes: { 'GET /settings': { aiEnabled: true, aiAvailable: true, palette: 'reliquary' } },
    });
    assert.equal(attr(), 'reliquary');
    assert.equal(store.data[CACHE_KEY], 'reliquary');
    // A saved Settings reply switches it without a reload
    await act(async () => ai.setAiState({ aiEnabled: true, aiAvailable: true, palette: 'nave' }));
    assert.equal(attr(), 'nave');
    assert.equal(store.data[CACHE_KEY], 'nave');
    await view.unmount();
  });
});

test('AiContext leaves the palette alone when the settings read fails', async () => {
  document.documentElement.dataset.palette = 'nave';
  const view = await renderApp(h(Probe), { routes: { 'GET /settings': () => { throw new Error('down'); } } });
  assert.equal(attr(), 'nave');
  await view.unmount();
});
