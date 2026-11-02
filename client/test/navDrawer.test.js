import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click, press, act } from './support/render.js';
import { setViewport, resetViewport } from './support/viewport.js';
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

async function open(width, path = '/work/w1/chapter/c1') {
  setViewport(width);
  const view = await renderApp(h(App), { routes, path });
  await flush();
  return view;
}

const nav = (view) => view.query('nav.sidebar');

async function openNav(view) {
  const menu = view.query('.topbar-menu');
  menu.focus();
  await click(menu);
}

// A real left click on a link: react-router ignores a click with no button
async function clickLink(el) {
  await act(async () => {
    const event = new window.Event('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'button', { value: 0 });
    el.dispatchEvent(event);
  });
  await flush();
}

test('at 390px the nav is a closed drawer and the top bar has a menu button', async () => {
  const view = await open(390);
  const menu = view.query('.topbar-menu');
  assert.ok(menu);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.getAttribute('aria-controls'), 'drawer-nav');
  assert.match(nav(view).className, /\bdrawer--left\b/);
  assert.equal(nav(view).hasAttribute('inert'), true);
  assert.equal(view.query('.drawer-backdrop'), null);
  await view.unmount();
});

test('the menu button opens the nav; Esc, the backdrop and the close button each close it', async () => {
  const view = await open(390);
  await openNav(view);
  assert.match(nav(view).className, /\bis-open\b/);
  assert.equal(nav(view).hasAttribute('inert'), false);
  assert.equal(view.query('.topbar-menu').getAttribute('aria-expanded'), 'true');
  assert.ok(view.query('.drawer-backdrop'));

  await press(nav(view), 'Escape');
  assert.doesNotMatch(nav(view).className, /\bis-open\b/);

  await openNav(view);
  await click(view.query('.drawer-backdrop'));
  assert.doesNotMatch(nav(view).className, /\bis-open\b/);

  await openNav(view);
  await click(view.query('nav.sidebar .drawer-close'));
  assert.doesNotMatch(nav(view).className, /\bis-open\b/);
  await view.unmount();
});

test('following a link in the nav closes it', async () => {
  const view = await open(390);
  await openNav(view);
  const settings = view.queryAll('nav.sidebar a').find((a) => a.getAttribute('href') === '/settings');
  await clickLink(settings);
  assert.doesNotMatch(nav(view).className, /\bis-open\b/);
  assert.equal(view.query('.drawer-backdrop'), null);
  await view.unmount();
});

test('widening the window with the nav open closes it and leaves nothing behind', async () => {
  const view = await open(390);
  await openNav(view);
  await act(async () => setViewport(1280));
  await flush();
  assert.equal(view.query('.drawer-backdrop'), null);
  assert.equal(nav(view).className, 'sidebar');
  assert.equal(nav(view).hasAttribute('inert'), false);
  assert.equal(view.query('.topbar-menu'), null);
  await view.unmount();
});

test('a tablet gets the nav drawer too', async () => {
  const view = await open(800);
  assert.ok(view.query('.topbar-menu'));
  assert.match(nav(view).className, /\bdrawer--left\b/);
  await view.unmount();
});

test('on desktop the nav is exactly the inline sidebar it was (A4)', async () => {
  const view = await open(1280);
  assert.equal(view.query('.topbar-menu'), null);
  assert.equal(view.query('.drawer-backdrop'), null);
  const el = nav(view);
  assert.equal(el.className, 'sidebar');
  for (const name of ['inert', 'role', 'id', 'tabindex', 'aria-modal']) assert.equal(el.hasAttribute(name), false, name);
  assert.equal(el.getAttribute('aria-label'), 'Rooms');
  await view.unmount();
});

test('the menu button is on the top bar of pages without a work too', async () => {
  const view = await open(390, '/');
  assert.ok(view.query('.topbar-menu'));
  await view.unmount();
});
