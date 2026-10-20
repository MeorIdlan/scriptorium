import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush } from './support/render.js';
import './support/focus.js';
import App from '../src/App.jsx';

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

// Firefox treats a scrollable region with no focusable children as a Tab stop. Its ring
// is then covered by the scrolled cards at the bottom edge, so the region is not a Tab stop.
test('the page content region is not a Tab stop, so Firefox does not focus it as a scroll area', async () => {
  const view = await renderApp(h(App), { routes, path: '/work/w1/chapter/c1' });
  await flush();
  assert.equal(view.query('.content').getAttribute('tabindex'), '-1');
  await view.unmount();
});
