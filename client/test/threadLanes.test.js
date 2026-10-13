import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touches, gapThreshold, findGaps, laneGaps, openAtEnd } from '../src/utils/threadLanes.js';

const open = { id: 'thr_a', name: 'Missing sister', status: 'open' };
const done = { id: 'thr_b', name: 'The heist', status: 'resolved' };

const book = [
  { id: 'c1', threadIds: ['thr_a'], scenes: [] },
  { id: 'c2', scenes: [{ id: 's1', threadIds: [] }, { id: 's2', threadIds: ['thr_a', 'thr_b'] }] },
  { id: 'c3', scenes: [{ id: null, threadIds: ['thr_b'] }] },
  { id: 'c4' },
];

test('touches counts a chapter tag or any scene tag, and keeps the tagged scene indexes', () => {
  assert.deepEqual(touches(open, book), [
    { touched: true, sceneIndexes: [] },
    { touched: true, sceneIndexes: [1] },
    { touched: false, sceneIndexes: [] },
    { touched: false, sceneIndexes: [] },
  ]);
});

test('touches ignores other threads and copes with missing scenes and threadIds', () => {
  assert.deepEqual(touches(done, book).map((t) => t.touched), [false, true, true, false]);
  assert.deepEqual(touches(open, []), []);
  assert.deepEqual(touches(open, undefined), []);
  assert.deepEqual(touches(open, [{ id: 'x', scenes: [null, { threadIds: null }] }]), [{ touched: false, sceneIndexes: [] }]);
});

test('gapThreshold is 20% of the chapters, never below 3', () => {
  assert.equal(gapThreshold(0), 3);
  assert.equal(gapThreshold(2), 3);
  assert.equal(gapThreshold(10), 3);
  assert.equal(gapThreshold(15), 3);
  assert.equal(gapThreshold(16), 4);
  assert.equal(gapThreshold(40), 8);
});

test('findGaps returns runs of at least the threshold, including the start and the tail', () => {
  const t = true;
  const f = false;
  assert.deepEqual(findGaps([f, f, f, t, t, f, f, t, f, f, f, f], 3), [
    { start: 0, end: 2, length: 3 },
    { start: 8, end: 11, length: 4 },
  ]);
  assert.deepEqual(findGaps([t, f, f, t], 3), []);
  assert.deepEqual(findGaps([f, f, f], 3), [{ start: 0, end: 2, length: 3 }]);
  assert.deepEqual(findGaps([], 3), []);
});

test('laneGaps never flags a resolved thread and flags a never-touched open one', () => {
  const long = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}` }));
  assert.deepEqual(laneGaps(open, long), [{ start: 0, end: 5, length: 6 }]);
  assert.deepEqual(laneGaps(done, long), []);
});

test('laneGaps uses the book-length threshold', () => {
  const chapters = Array.from({ length: 10 }, (_, i) => (i === 0 ? { id: 'c0', threadIds: ['thr_a'] } : { id: `c${i}` }));
  assert.deepEqual(laneGaps(open, chapters), [{ start: 1, end: 9, length: 9 }]);
  chapters[3] = { id: 'c3', threadIds: ['thr_a'] };
  chapters[7] = { id: 'c7', threadIds: ['thr_a'] };
  // touched at 0, 3 and 7: only the run 4-6 reaches the threshold of 3
  assert.deepEqual(laneGaps(open, chapters), [{ start: 4, end: 6, length: 3 }]);
});

test('openAtEnd lists open threads not touched in the last chapter, with their last touch', () => {
  assert.deepEqual(openAtEnd([open, done], book), [{ thread: open, lastChapter: 1 }]);
  const never = { id: 'thr_c', name: 'Never', status: 'open' };
  assert.deepEqual(openAtEnd([never], book), [{ thread: never, lastChapter: null }]);
});

test('openAtEnd leaves out threads touched in the final chapter and resolved ones', () => {
  const ends = [{ id: 'c1' }, { id: 'c2', threadIds: ['thr_a'] }];
  assert.deepEqual(openAtEnd([open, done], ends), []);
  assert.deepEqual(openAtEnd([open], []), []);
  assert.deepEqual(openAtEnd(undefined, book), []);
});

test('laneGaps flags a never-touched open thread even when the book is shorter than the threshold', () => {
  assert.deepEqual(laneGaps(open, [{ id: 'c1' }]), [{ start: 0, end: 0, length: 1 }]);
  assert.deepEqual(laneGaps(open, [{ id: 'c1' }, { id: 'c2' }]), [{ start: 0, end: 1, length: 2 }]);
  assert.deepEqual(laneGaps(done, [{ id: 'c1' }, { id: 'c2' }]), []);
  assert.deepEqual(laneGaps(open, []), []);
});

test('laneGaps does not flag a short book where the thread is touched', () => {
  assert.deepEqual(laneGaps(open, [{ id: 'c1', threadIds: ['thr_a'] }, { id: 'c2' }]), []);
});
