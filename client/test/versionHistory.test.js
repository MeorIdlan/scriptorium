import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT, versionLabel, dayLabel, groupByDay, defaultMilestoneName, orderPair, flushOpenChapter,
} from '../src/utils/versionHistory.js';

test('versionLabel per kind', () => {
  assert.equal(versionLabel({ kind: 'named', name: 'Draft A' }), '★ Draft A');
  assert.equal(versionLabel({ kind: 'milestone', milestoneName: 'Beta' }), '◆ Beta');
  assert.equal(versionLabel({ kind: 'milestone', milestoneName: '' }), '◆ Milestone');
  assert.equal(versionLabel({ kind: 'auto', note: 'Before restore' }), 'Before restore');
  assert.equal(versionLabel({ kind: 'auto', note: '' }), 'Autosave');
});

test('dayLabel says Today, Yesterday, then the date', () => {
  const now = new Date(2026, 9, 11, 12);
  assert.equal(dayLabel(new Date(2026, 9, 11, 1).toISOString(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 9, 10, 23).toISOString(), now), 'Yesterday');
  assert.equal(dayLabel(new Date(2026, 9, 3, 9).toISOString(), now), '3 Oct 2026');
});

test('groupByDay keeps order and groups neighbours', () => {
  const now = new Date(2026, 9, 11, 12);
  const v = (id, d) => ({ id, createdAt: d.toISOString() });
  const groups = groupByDay([
    v('a', new Date(2026, 9, 11, 11)),
    v('b', new Date(2026, 9, 11, 9)),
    v('c', new Date(2026, 9, 10, 9)),
    v('d', new Date(2026, 9, 3, 9)),
  ], now);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    ['3 Oct 2026', ['d']],
  ]);
});

test('defaultMilestoneName uses the en-GB date', () => {
  assert.equal(defaultMilestoneName(new Date(2026, 9, 11, 12)), 'Milestone — 11 Oct 2026');
});

test('orderPair puts the older version first and the current text last', () => {
  const old = { id: 's1', createdAt: '2026-10-01T00:00:00.000Z' };
  const newer = { id: 's2', createdAt: '2026-10-05T00:00:00.000Z' };
  const current = { id: CURRENT, createdAt: null };
  assert.deepEqual(orderPair(newer, old), [old, newer]);
  assert.deepEqual(orderPair(current, old), [old, current]);
  assert.deepEqual(orderPair(old, current), [old, current]);
});

test('flushOpenChapter saves unsaved editor text for the open chapter only', async () => {
  const calls = [];
  const api = { put: async (path, body) => calls.push([path, body]) };
  const editor = { chapterId: 'c1', hasUnsavedChanges: true, content: 'Typed.', html: '<div>Typed.</div>' };
  await flushOpenChapter(api, 'w1', editor, 'c2');
  await flushOpenChapter(api, 'w1', { ...editor, hasUnsavedChanges: false }, 'c1');
  assert.equal(calls.length, 0);
  await flushOpenChapter(api, 'w1', editor, 'c1');
  assert.deepEqual(calls, [['/works/w1/chapters/c1', { content: 'Typed.', contentHtml: '<div>Typed.</div>' }]]);
});
