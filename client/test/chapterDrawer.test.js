import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, click, press, type } from './support/render.js';
import { clickLink } from './support/link.js';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import App from '../src/App.jsx';
import { isMainRoomPath } from '../src/utils/mainRoomPath.js';

afterEach(resetViewport);

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
  'GET /works/w1/chapters': [
    { id: 'c1', number: 1, title: 'One', wordCount: 1 },
    { id: 'c2', number: 2, title: 'Two', wordCount: 1 },
  ],
  'GET /works/w1/chapters/c1': { id: 'c1', content: 'text', contentHtml: '<p>text</p>' },
  'GET /works/w1/chapters/c2': { id: 'c2', content: 'more', contentHtml: '<p>more</p>' },
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'GET /works/w1/threads': [],
  'GET /works/w1/milestones': [],
  'GET /progress/today': { date: '2026-10-20', words: 0, goal: null },
};

async function open(width) {
  setViewport(width);
  const view = await renderApp(h(App), { routes, path: '/work/w1/chapter/c1' });
  await flush();
  return view;
}

const aside = (view) => view.query('aside.chapter-sidebar');
const pill = (view) => view.query('.topbar-chapter-pill');

async function openChapters(view) {
  pill(view).focus();
  await click(pill(view));
}

test('isMainRoomPath is true for the Main Room and false for its sibling rooms', () => {
  assert.equal(isMainRoomPath('/work/w1'), true);
  assert.equal(isMainRoomPath('/work/w1/'), true);
  assert.equal(isMainRoomPath('/work/w1/chapter/c1'), true);
  assert.equal(isMainRoomPath('/work/w1/chapter/c1/'), true);
  assert.equal(isMainRoomPath('/work/w1/map'), false);
  assert.equal(isMainRoomPath('/work/w1/codex'), false);
  assert.equal(isMainRoomPath('/'), false);
  assert.equal(isMainRoomPath('/settings'), false);
});

test('on a phone the chapter pill is a button and the chapter list is a closed drawer', async () => {
  const view = await open(390);
  assert.equal(pill(view).tagName, 'BUTTON');
  assert.equal(pill(view).getAttribute('aria-controls'), 'drawer-chapters');
  assert.equal(pill(view).getAttribute('aria-expanded'), 'false');
  assert.match(aside(view).className, /\bdrawer--left\b/);
  assert.equal(aside(view).hasAttribute('inert'), true);
  await view.unmount();
});

test('the pill opens the chapter list; picking another chapter loads it and closes the list', async () => {
  const view = await open(390);
  await openChapters(view);
  assert.match(aside(view).className, /\bis-open\b/);
  assert.equal(pill(view).getAttribute('aria-expanded'), 'true');
  const second = view.queryAll('.chapter-item')[1];
  await click(second);
  assert.doesNotMatch(aside(view).className, /\bis-open\b/);
  assert.ok(view.fetch.calls.some((c) => c.path === '/works/w1/chapters/c2'));
  await view.unmount();
});

test('picking the chapter that is already open also closes the list', async () => {
  const view = await open(390);
  await openChapters(view);
  await click(view.query('.chapter-item.active'));
  assert.doesNotMatch(aside(view).className, /\bis-open\b/);
  await view.unmount();
});

test('the close button closes it, and so does Esc', async () => {
  const view = await open(390);
  await openChapters(view);
  await click(view.query('aside.chapter-sidebar .drawer-close'));
  assert.doesNotMatch(aside(view).className, /\bis-open\b/);
  await openChapters(view);
  await press(aside(view), 'Escape');
  assert.doesNotMatch(aside(view).className, /\bis-open\b/);
  await view.unmount();
});

test('Esc in the add-chapter field closes the field and leaves the list open', async () => {
  const view = await open(390);
  await openChapters(view);
  await click(view.query('button[aria-label="Add chapter"]'));
  const input = view.query('.chapter-add-input');
  assert.ok(input);
  await press(input, 'Escape');
  assert.equal(view.query('.chapter-add-input'), null);
  assert.match(aside(view).className, /\bis-open\b/);
  await view.unmount();
});

test('a modal opened from the list closes on Esc and leaves the list open behind it', async () => {
  const view = await open(390);
  await openChapters(view);
  await click(view.query('button[aria-label="Milestones"]'));
  // The modal is portalled to document.body
  const modal = document.querySelector('.modal');
  assert.ok(modal);
  await press(modal, 'Escape');
  assert.equal(document.querySelector('.modal'), null);
  assert.match(aside(view).className, /\bis-open\b/);
  await view.unmount();
});

test('the pill is a plain label on other rooms', async () => {
  const view = await open(390);
  await openChapters(view);
  const map = view.queryAll('nav.sidebar a').find((a) => a.getAttribute('href') === '/work/w1/map');
  await clickLink(map);
  assert.equal(view.query('aside.chapter-sidebar'), null);
  assert.equal(pill(view).tagName, 'SPAN');
  await view.unmount();
});

test('on a tablet and on desktop the chapter list stays inline and the pill is a label (A4)', async () => {
  for (const width of [800, 1280]) {
    const view = await open(width);
    assert.equal(aside(view).className, 'chapter-sidebar', `${width}px`);
    for (const name of ['inert', 'role', 'id', 'aria-modal']) assert.equal(aside(view).hasAttribute(name), false, name);
    assert.equal(pill(view).tagName, 'SPAN', `${width}px`);
    assert.equal(view.query('.chapter-sidebar .drawer-close'), null);
    await view.unmount();
  }
});
