import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { render, cleanup, click, press, act, flush } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import { UIProvider, uiReducer, useUI } from '../src/context/UIContext.jsx';
import { useDrawer, drawerId } from '../src/hooks/useDrawer.js';
import DrawerBackdrop from '../src/components/layout/DrawerBackdrop.jsx';
import DrawerClose from '../src/components/layout/DrawerClose.jsx';

afterEach(async () => {
  await cleanup();
  resetViewport();
});

let ui;
function Host({ placement }) {
  ui = useUI();
  const d = useDrawer('nav', placement, 'Menu');
  return h(
    'div',
    null,
    h('button', { id: 'opener', onClick: d.open }, 'open'),
    h(
      'aside',
      { className: `box${d.className}`, ...d.attrs },
      d.isDrawer ? h(DrawerClose, { label: 'Menu', onClose: d.close }) : null,
      h('button', { id: 'first' }, 'a'),
      h('button', { id: 'last' }, 'b')
    ),
    h(DrawerBackdrop)
  );
}

async function mount(placement) {
  setViewport(390); // the backdrop is drawn only on phones and tablets
  const view = await render(h(UIProvider, null, h(Host, { placement })));
  const q = (sel) => view.container.querySelector(sel);
  return { view, q };
}

async function openDrawer(q) {
  q('#opener').focus();
  await click(q('#opener'));
}

test('OPEN_DRAWER opens one drawer at a time and CLOSE_DRAWER closes it', () => {
  let state = uiReducer({ drawer: null }, { type: 'OPEN_DRAWER', name: 'nav' });
  assert.equal(state.drawer, 'nav');
  state = uiReducer(state, { type: 'OPEN_DRAWER', name: 'panel' });
  assert.equal(state.drawer, 'panel');
  state = uiReducer(state, { type: 'CLOSE_DRAWER' });
  assert.equal(state.drawer, null);
});

test('drawerId names the element a button can point at', () => {
  assert.equal(drawerId('nav'), 'drawer-nav');
});

test('with no placement the element is left exactly as it was', async () => {
  const { q } = await mount(null);
  const panel = q('.box');
  assert.equal(panel.className, 'box');
  assert.equal(panel.hasAttribute('inert'), false);
  assert.equal(panel.hasAttribute('role'), false);
  assert.equal(panel.hasAttribute('id'), false);
  assert.equal(q('.drawer-close'), null);
});

test('a closed drawer is positioned, inert and labelled', async () => {
  const { q } = await mount('left');
  const panel = q('.box');
  assert.match(panel.className, /\bdrawer\b/);
  assert.match(panel.className, /\bdrawer--left\b/);
  assert.doesNotMatch(panel.className, /\bis-open\b/);
  assert.equal(panel.hasAttribute('inert'), true);
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-label'), 'Menu');
  assert.equal(q('.drawer-backdrop'), null);
});

test('opening moves focus inside; Esc closes and returns focus to the opener', async () => {
  const { q } = await mount('left');
  await openDrawer(q);
  const panel = q('.box');
  assert.match(panel.className, /\bis-open\b/);
  assert.equal(panel.hasAttribute('inert'), false);
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.ok(panel.contains(document.activeElement));
  assert.ok(q('.drawer-backdrop'));
  await press(panel, 'Escape');
  assert.equal(ui.state.drawer, null);
  assert.doesNotMatch(q('.box').className, /\bis-open\b/);
  assert.equal(document.activeElement.id, 'opener');
});

test('Tab wraps from the last control to the first, Shift+Tab from the first to the last', async () => {
  const { q } = await mount('left');
  await openDrawer(q);
  const close = q('.drawer-close'); // the first control inside the drawer
  const last = q('#last');
  last.focus();
  await press(last, 'Tab');
  assert.equal(document.activeElement, close);
  await act(async () => {
    const event = new window.Event('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: 'Tab' });
    Object.defineProperty(event, 'shiftKey', { value: true });
    close.dispatchEvent(event);
  });
  await flush();
  assert.equal(document.activeElement, last);
});

test('the backdrop and the close button both close it', async () => {
  const { q } = await mount('left');
  await openDrawer(q);
  await click(q('.drawer-backdrop'));
  assert.equal(ui.state.drawer, null);
  assert.equal(q('.drawer-backdrop'), null);
  await openDrawer(q);
  assert.equal(q('.drawer-close').getAttribute('aria-label'), 'Close Menu');
  await click(q('.drawer-close'));
  assert.equal(ui.state.drawer, null);
});

test('page-enter leaves no transform behind', () => {
  // A kept transform would make fixed drawers inside the page position against the page, not the screen
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const rule = css.match(/\.page-enter\s*\{([^}]*)\}/)[1];
  const animation = rule.match(/animation:\s*([^;]+);/)[1];
  assert.doesNotMatch(animation, /\b(both|forwards)\b/);
});

test('an open drawer clears the transform its placement sets, for every placement', () => {
  // `.drawer.is-open` ties with `.drawer.drawer--left` on specificity and comes first, so each
  // placement needs its own open rule or the drawer stays off-screen
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const placement of ['left', 'right', 'bottom']) {
    const open = new RegExp(`\\.drawer\\.drawer--${placement}\\.is-open[^{]*\\{[^}]*transform:\\s*none`);
    assert.match(css, open, placement);
  }
});
