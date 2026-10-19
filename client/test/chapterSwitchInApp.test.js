import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, click, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import App from '../src/App.jsx';
import { pageKey } from '../src/utils/pageKey.js';

const chapter = (id, n) => ({ id, number: n, title: `Title ${id}`, wordCount: 1 });
const body = (id) => ({ id, content: `text of ${id}`, contentHtml: `<p>text of ${id}</p>` });

const routes = {
  'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
  'GET /works/w1/chapters': [chapter('c1', 1), chapter('c2', 2)],
  'GET /works/w1/chapters/c1': body('c1'),
  'GET /works/w1/chapters/c2': body('c2'),
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
  'GET /works/w1/threads': [],
  'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
};

const count = (view, method, path) => view.fetch.calls.filter((c) => c.method === method && c.path === path).length;

test('pageKey keeps one page for every chapter of a work', () => {
  assert.equal(pageKey('/work/w1/chapter/c2'), '/work/w1');
  assert.equal(pageKey('/work/w1'), '/work/w1');
  assert.equal(pageKey('/work/w1/map'), '/work/w1/map');
  assert.equal(pageKey('/work/w1/codex'), '/work/w1/codex');
  assert.equal(pageKey('/'), '/');
});

test('switching chapters inside the app keeps the Main Room and saves once', async () => {
  const view = await renderApp(h(App), { routes, path: '/work/w1/chapter/c1' });
  assert.equal(view.query('.editor').textContent, 'text of c1');
  const el = view.query('.editor');
  await act(async () => {
    el.innerHTML = '<p>text of c1 and more</p>';
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
  await click(view.button('Title c2'));
  assert.equal(view.query('.editor').textContent, 'text of c2');
  // The work isn't reloaded and the room's loading page never shows
  assert.equal(count(view, 'GET', '/works/w1'), 1);
  assert.equal(count(view, 'GET', '/works/w1/chapters/c2'), 1);
  assert.deepEqual(
    view.fetch.calls.filter((c) => c.method === 'PUT').map((c) => [c.path, c.body.content]),
    [['/works/w1/chapters/c1', 'text of c1 and more']]
  );
});
