import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chapterLabel,
  filterCatches,
  groupCatches,
  openCountsByChapter,
  timeAgo,
  usedAsLabel,
  liveChapterId,
  MAX_CATCH_LENGTH,
  catchLengthError,
} from '../src/utils/catchGroups.js';

const chapters = [
  { id: 'c2', number: 2, title: 'The Well', order: 1 },
  { id: 'c1', number: 1, title: 'Arrival', order: 0 },
  { id: 'c3', number: 3, title: '  ', order: 2 },
];
const k = (id, content, extra = {}) => ({ id, content, status: 'open', taggedChapterId: null, createdAt: '2026-10-01T00:00:00.000Z', ...extra });

test('chapterLabel formats number and title, with Untitled for blank titles', () => {
  assert.equal(chapterLabel(chapters[0]), 'Ch. 2 — The Well');
  assert.equal(chapterLabel(chapters[2]), 'Ch. 3 — Untitled');
});

test('filterCatches filters by status, with all meaning every status', () => {
  const list = [k('a', 'one'), k('b', 'two', { status: 'used' }), k('c', 'three', { status: 'discarded' })];
  assert.deepEqual(filterCatches(list).map((c) => c.id), ['a']);
  assert.deepEqual(filterCatches(list, { status: 'used' }).map((c) => c.id), ['b']);
  assert.deepEqual(filterCatches(list, { status: 'all' }).map((c) => c.id), ['a', 'b', 'c']);
});

test('filterCatches searches text and tagged chapter title, case-insensitive and trimmed', () => {
  const list = [k('a', 'She LIES about the letter'), k('b', 'rain', { taggedChapterId: 'c2' }), k('c', 'other')];
  assert.deepEqual(filterCatches(list, { query: '  lies ', chapters }).map((c) => c.id), ['a']);
  assert.deepEqual(filterCatches(list, { query: 'well', chapters }).map((c) => c.id), ['b']);
  assert.deepEqual(filterCatches(list, { query: '   ', chapters }).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(filterCatches(list, { query: 'zzz', chapters }), []);
});

test('filterCatches tolerates missing content and a missing list', () => {
  assert.deepEqual(filterCatches(undefined), []);
  assert.deepEqual(filterCatches([{ id: 'x', status: 'open' }], { query: 'a' }), []);
});

test('groupCatches: this chapter, untagged, then other chapters in book order, newest first', () => {
  const list = [
    k('old-here', 'a', { taggedChapterId: 'c2', createdAt: '2026-10-01T00:00:00.000Z' }),
    k('new-here', 'b', { taggedChapterId: 'c2', createdAt: '2026-10-05T00:00:00.000Z' }),
    k('loose', 'c'),
    k('in-3', 'd', { taggedChapterId: 'c3' }),
    k('in-1', 'e', { taggedChapterId: 'c1' }),
  ];
  const groups = groupCatches(list, chapters, 'c2');
  assert.deepEqual(groups.map((g) => [g.key, g.title]), [
    ['this', 'For this chapter'],
    ['untagged', 'Untagged'],
    ['c1', 'Ch. 1 — Arrival'],
    ['c3', 'Ch. 3 — Untitled'],
  ]);
  assert.deepEqual(groups[0].items.map((c) => c.id), ['new-here', 'old-here']);
});

test('groupCatches puts tags to missing chapters under Untagged and omits empty groups', () => {
  const groups = groupCatches([k('ghost', 'x', { taggedChapterId: 'ch_gone' })], chapters, null);
  assert.deepEqual(groups.map((g) => g.key), ['untagged']);
  assert.deepEqual(groupCatches([], chapters, 'c1'), []);
});

test('openCountsByChapter counts only open, tagged catches', () => {
  const counts = openCountsByChapter([
    k('a', 'x', { taggedChapterId: 'c1' }),
    k('b', 'x', { taggedChapterId: 'c1' }),
    k('c', 'x', { taggedChapterId: 'c1', status: 'used' }),
    k('d', 'x'),
    k('e', 'x', { taggedChapterId: 'c2' }),
  ]);
  assert.equal(counts.get('c1'), 2);
  assert.equal(counts.get('c2'), 1);
  assert.equal(counts.has(null), false);
  assert.equal(openCountsByChapter(undefined).size, 0);
});

test('timeAgo buckets', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(20 * 1000), now), 'just now');
  assert.equal(timeAgo(ago(5 * 60 * 1000), now), '5 min ago');
  assert.equal(timeAgo(ago(3 * 3600 * 1000), now), '3 h ago');
  assert.equal(timeAgo(ago(2 * 86400 * 1000), now), '2 d ago');
  const old = timeAgo(ago(40 * 86400 * 1000), now);
  assert.ok(old && !old.includes('ago'), old);
  assert.equal(timeAgo('not a date', now), '');
  assert.equal(timeAgo(ago(-60 * 1000), now), 'just now');
});

test('usedAsLabel describes what the catch became', () => {
  assert.equal(usedAsLabel({ kind: 'insert', refId: 'c1', label: 'Ch. 1 — Arrival' }), 'Inserted in Ch. 1 — Arrival');
  assert.equal(usedAsLabel({ kind: 'codex-character', refId: 'x', label: 'Mara' }), 'Codex character: Mara');
  assert.equal(usedAsLabel({ kind: 'codex-place', refId: 'x', label: 'The Well' }), 'Codex place: The Well');
  assert.equal(usedAsLabel({ kind: 'codex-rule', refId: 'x', label: 'Bells bind' }), 'Codex rule: Bells bind');
  assert.equal(usedAsLabel({ kind: 'map-note', refId: 'c1', label: 'Ch. 1 — Arrival' }), 'Map note: Ch. 1 — Arrival');
  assert.equal(usedAsLabel(null), '');
  assert.equal(usedAsLabel(undefined), '');
});

test('liveChapterId keeps a tag only when the chapter still exists', () => {
  assert.equal(liveChapterId(chapters, 'c2'), 'c2');
  assert.equal(liveChapterId(chapters, 'ch_gone'), '');
  assert.equal(liveChapterId(chapters, null), '');
  assert.equal(liveChapterId(chapters, undefined), '');
});

test('catchLengthError explains an over-long catch, counting trimmed text', () => {
  assert.equal(MAX_CATCH_LENGTH, 2000);
  assert.equal(catchLengthError('x'.repeat(2000)), '');
  assert.equal(catchLengthError(`  ${'x'.repeat(2000)}  `), '');
  assert.equal(catchLengthError('x'.repeat(2143)), '2,143 / 2,000 characters. Shorten it to save.');
  assert.equal(catchLengthError(''), '');
  assert.equal(catchLengthError(undefined), '');
});
