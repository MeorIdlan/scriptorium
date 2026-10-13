import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { click } from './support/render.js';
import ChapterHistoryModal from '../src/components/overlays/ChapterHistoryModal.jsx';

const base = '/works/w1/chapters/c1/snapshots';
const routes = {
  [`GET ${base}`]: [{ id: 'snap_1', kind: 'named', name: 'Keep', note: '', milestoneId: null, wordCount: 2, createdAt: '2026-10-13T00:00:00.000Z' }],
  [`GET ${base}/snap_1`]: { content: 'Old.' },
  [`POST ${base}/snap_1/restore`]: { id: 'c1', content: 'Old.', contentHtml: '<div>Old.</div>', threadIds: ['thr_1'] },
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One', threadIds: ['thr_1'] }],
};
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(label));

test('restoring a version reloads the chapter list so chapter tags are not stale', async () => {
  const view = await renderApp(h(ChapterHistoryModal, { workId: 'w1', chapterId: 'c1', onDismiss() {} }), { routes });
  await click(button('Restore this version'));
  await click(button('Restore'));
  assert.ok(view.fetch.calls.some((c) => c.method === 'POST' && c.path === `${base}/snap_1/restore`));
  assert.ok(view.fetch.calls.some((c) => c.method === 'GET' && c.path === '/works/w1/chapters'));
  await view.unmount();
});
