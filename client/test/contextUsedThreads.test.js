import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render, click } from './support/render.js';
import ContextUsed from '../src/components/panel/ContextUsed.jsx';

test('the line counts plot threads, singular and plural', async () => {
  const one = await render(h(ContextUsed, { context: { threads: ['The letter'] } }));
  assert.match(one.container.textContent, /Context: 1 plot thread(?!s)/);
  await one.unmount();
  const two = await render(h(ContextUsed, { context: { story: true, threads: ['The letter', 'The heir'] } }));
  assert.match(two.container.textContent, /story details · 2 plot threads/);
  await two.unmount();
});

test('opening the line lists the thread names, even with nothing else to expand', async () => {
  const view = await render(h(ContextUsed, { context: { threads: ['The letter', 'The heir'] } }));
  const line = view.container.querySelector('.context-used-line');
  assert.equal(line.disabled, false);
  await click(line);
  assert.match(view.container.querySelector('.context-used-details').textContent, /Threads: The letter, The heir/);
  await view.unmount();
});

test('no threads adds nothing to the line', async () => {
  const view = await render(h(ContextUsed, { context: { story: true, threads: [] } }));
  assert.ok(!/plot thread/.test(view.container.textContent));
  await view.unmount();
});
