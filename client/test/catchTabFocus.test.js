import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click, flush } from './support/render.js';
import './support/focus.js';
import CatchTab from '../src/components/panel/CatchTab.jsx';

const catchItem = (id, content) => ({
  id, content, status: 'open', taggedChapterId: null, capturedDuringChapterId: null, createdAt: '2026-10-01T00:00:00.000Z',
});

// A list the server answers from: discarding a catch drops it from the Open filter
async function mountList(items) {
  let store = items;
  const discard = (id) => () => {
    store = store.map((c) => (c.id === id ? { ...c, status: 'discarded' } : c));
    return {};
  };
  const routes = { 'GET /works/w1/catches': () => store };
  for (const item of items) routes[`PUT /works/w1/catches/${item.id}`] = discard(item.id);
  const view = await renderApp(h(CatchTab, { workId: 'w1' }), { routes });
  await flush();
  return view;
}

const rowsOf = (view) => [...view.container.querySelectorAll('.catch-row')];
const discardIn = (row) => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Discard');

test('discarding a catch in the middle moves focus to the next row', async () => {
  const view = await mountList([catchItem('c1', 'One'), catchItem('c2', 'Two'), catchItem('c3', 'Three')]);
  await click(discardIn(rowsOf(view)[1]));
  assert.equal(rowsOf(view).length, 2);
  assert.equal(document.activeElement === rowsOf(view)[1].querySelector('button'), true);
  await view.unmount();
});

test('discarding the last catch moves focus to the previous row', async () => {
  const view = await mountList([catchItem('c1', 'One'), catchItem('c2', 'Two'), catchItem('c3', 'Three')]);
  await click(discardIn(rowsOf(view)[2]));
  assert.equal(rowsOf(view).length, 2);
  assert.equal(document.activeElement === rowsOf(view)[1].querySelector('button'), true);
  await view.unmount();
});

test('discarding the only catch moves focus to the search field', async () => {
  const view = await mountList([catchItem('c1', 'One')]);
  await click(discardIn(rowsOf(view)[0]));
  assert.equal(rowsOf(view).length, 0);
  assert.equal(document.activeElement === view.container.querySelector('.catch-search'), true);
  await view.unmount();
});
