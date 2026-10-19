import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush } from './support/render.js';
import './support/focus.js';
// app.js loads the DOM globals react-dom needs before react-router-dom loads it
import { useLocation } from 'react-router-dom';
import MainRoom from '../src/pages/MainRoom.jsx';

// Records the location state the Main Room sees, so a test can see it cleared
const arrival = {};
function LocationProbe() {
  arrival.state = useLocation().state;
  return null;
}

const routes = {
  'GET /works/w9': { id: 'w9', title: 'The Long Road', currentChapterId: null },
  'GET /works/w9/chapters': [{ id: 'c1', title: 'One', wordCount: 0 }],
  'GET /works/w9/chapters/c1': { id: 'c1', title: 'One', content: '', contentHtml: '' },
  'GET /works/w9/catches': [],
  'GET /progress/today': { date: '2026-10-20', words: 0, goal: null },
  'GET /works/w9/threads': [],
  'GET /works/w9/codex': {},
  'GET /works/w9/milestones': [],
};

// Arriving from Create Work: the route carries focusEditor in its state
test('arriving from Create Work focuses the editor once the first chapter is in it', async () => {
  const view = await renderApp(h('div', null, h(MainRoom), h(LocationProbe)), {
    path: '/work/w9', route: '/work/:workId', state: { focusEditor: true }, routes,
  });
  await flush();
  assert.equal(document.activeElement === view.container.querySelector('.editor'), true);
  assert.equal(arrival.state, null);
  await view.unmount();
});

test('without the focusEditor state the Main Room leaves focus where it is', async () => {
  const view = await renderApp(h(MainRoom), { path: '/work/w9', route: '/work/:workId', routes });
  await flush();
  assert.equal(document.activeElement === view.container.querySelector('.editor'), false);
  await view.unmount();
});
