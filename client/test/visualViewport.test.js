import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, cleanup, act, flush } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
import { useVisualViewport } from '../src/hooks/useVisualViewport.js';

const root = () => document.documentElement;
const read = (name) => root().style.getPropertyValue(name);

function fakeViewport(height, offsetTop = 0) {
  const vv = new EventTarget();
  vv.height = height;
  vv.offsetTop = offsetTop;
  window.visualViewport = vv;
  return vv;
}

function Probe() {
  useVisualViewport();
  return h('span', null, 'x');
}

afterEach(async () => {
  await cleanup();
  resetViewport();
  delete window.visualViewport;
  root().style.removeProperty('--app-height');
  root().style.removeProperty('--app-top');
});

test('on a phone the layout height and top follow the visual viewport', async () => {
  setViewport(390);
  const vv = fakeViewport(844);
  await render(h(Probe));
  assert.equal(read('--app-height'), '844px');
  assert.equal(read('--app-top'), '0px');
  vv.height = 480; // the keyboard comes up
  vv.offsetTop = 12;
  await act(async () => vv.dispatchEvent(new Event('resize')));
  assert.equal(read('--app-height'), '480px');
  assert.equal(read('--app-top'), '12px');
  vv.offsetTop = 30;
  await act(async () => vv.dispatchEvent(new Event('scroll')));
  assert.equal(read('--app-top'), '30px');
});

test('a tablet follows it too', async () => {
  setViewport(800);
  fakeViewport(1024);
  await render(h(Probe));
  assert.equal(read('--app-height'), '1024px');
});

test('on desktop nothing is set, and widening the window removes what was set', async () => {
  setViewport(1280);
  fakeViewport(800);
  await render(h(Probe));
  assert.equal(read('--app-height'), '');
  await act(async () => setViewport(390));
  await flush();
  assert.equal(read('--app-height'), '800px');
  await act(async () => setViewport(1280));
  await flush();
  assert.equal(read('--app-height'), '');
  assert.equal(read('--app-top'), '');
});

test('without a visualViewport nothing is set and nothing throws', async () => {
  setViewport(390);
  await render(h(Probe));
  assert.equal(read('--app-height'), '');
});

test('unmounting removes the variables and the listeners', async () => {
  setViewport(390);
  const vv = fakeViewport(844);
  const view = await render(h(Probe));
  await view.unmount();
  assert.equal(read('--app-height'), '');
  vv.height = 300;
  vv.dispatchEvent(new Event('resize'));
  assert.equal(read('--app-height'), '');
});
