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
  // The status comes from the request: discard, used or reopen
  const setStatus = (id) => (body) => {
    store = store.map((c) => (c.id === id ? { ...c, status: body.status } : c));
    return {};
  };
  const routes = { 'GET /works/w1/catches': () => store };
  for (const item of items) routes[`PUT /works/w1/catches/${item.id}`] = setStatus(item.id);
  const view = await renderApp(h(CatchTab, { workId: 'w1' }), { routes });
  await flush();
  return view;
}

const rowsOf = (view) => [...view.container.querySelectorAll('.catch-row')];
const buttonIn = (row, label) => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const discardIn = (row) => buttonIn(row, 'Discard');
async function showAll(view) {
  await click([...view.container.querySelectorAll('.catch-filter-btn')].find((b) => b.textContent.trim() === 'All'));
}

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

// Under All a discarded catch stays in the list, now with Reopen: focus goes there, not on a neighbour
test('under All, discarding a catch keeps focus on its Reopen button', async () => {
  const view = await mountList([catchItem('c1', 'One'), catchItem('c2', 'Two'), catchItem('c3', 'Three')]);
  await showAll(view);
  await click(discardIn(rowsOf(view)[1]));
  assert.equal(rowsOf(view).length, 3);
  assert.equal(document.activeElement === buttonIn(rowsOf(view)[1], 'Reopen'), true);
  await view.unmount();
});

test('under All, discarding the only catch keeps focus on its Reopen button, not the search field', async () => {
  const view = await mountList([catchItem('c1', 'One')]);
  await showAll(view);
  await click(discardIn(rowsOf(view)[0]));
  assert.equal(document.activeElement === buttonIn(rowsOf(view)[0], 'Reopen'), true);
  assert.equal(document.activeElement === view.container.querySelector('.catch-search'), false);
  await view.unmount();
});

// Used takes the row out of the Open filter too, so it moves focus like Discard does
test('marking a catch used in the middle moves focus to the next row', async () => {
  const view = await mountList([catchItem('c1', 'One'), catchItem('c2', 'Two'), catchItem('c3', 'Three')]);
  const next = rowsOf(view)[2].querySelector('button');
  await click(buttonIn(rowsOf(view)[1], 'Used'));
  assert.equal(rowsOf(view).length, 2);
  assert.equal(document.activeElement === next, true);
  await view.unmount();
});
