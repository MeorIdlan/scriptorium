import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush } from './support/render.js';
import MapView from '../src/pages/MapView.jsx';

const threads = [{ id: 'thr_1', name: 'The missing heir', color: '#c9a96e', description: '', status: 'open', order: 0 }];
const chapters = [
  { id: 'c1', number: 1, title: 'One', wordCount: 900, threadIds: ['thr_1'], scenes: [] },
  { id: 'c2', number: 2, title: 'Two', wordCount: 700, threadIds: [], scenes: [{ id: 'scn_a', title: 'Arrival', threadIds: ['thr_1'] }] },
  { id: 'c3', number: 3, title: 'Three', wordCount: 500, threadIds: [], scenes: [] },
];

test('the Map shows the thread lanes above the thread manager', async () => {
  const view = await renderApp(h(MapView), {
    path: '/work/w1/map',
    route: '/work/:workId/map',
    routes: {
      'GET /works/w1': { id: 'w1', title: 'Harrowgate' },
      'GET /works/w1/chapters': chapters,
      'GET /works/w1/map': { chapters: {} },
      'GET /works/w1/threads': threads,
    },
  });
  await flush();
  await flush();
  const lanes = view.query('.thread-lanes');
  assert.ok(lanes, 'lanes section is on the Map');
  assert.equal(view.queryAll('.thread-lane').length, 1);
  assert.deepEqual(
    view.queryAll('.thread-lane .thread-lane-dot').map((d) => [d.dataset.chapter, d.dataset.scene ?? '']),
    [['c1', ''], ['c2', '0']]
  );
  const html = view.container.innerHTML;
  assert.ok(html.indexOf('thread-lanes') < html.indexOf('thread-manager'), 'lanes come before the manager');
  await view.unmount();
});
