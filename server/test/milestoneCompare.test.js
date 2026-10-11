import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milestoneRows } from '../src/services/milestoneCompare.js';

const milestone = [
  { chapterId: 'c1', title: 'One (old title)', order: 0, snapshotId: 's1', wordCount: 3 },
  { chapterId: 'c2', title: 'Two', order: 1, snapshotId: 's2', wordCount: 2 },
  { chapterId: 'c4', title: 'Four', order: 2, snapshotId: 's4', wordCount: 1 },
];
const texts = new Map([
  ['s1', 'A b c.'],
  ['s2', 'Gone now.'],
  ['s4', 'Same.'],
]);
const current = [
  { _id: 'c1', title: 'One', content: 'A b d.', wordCount: 3 },
  { _id: 'c4', title: 'Four', content: 'Same.', wordCount: 1 },
  { _id: 'c3', title: 'Three', content: 'Brand new.', wordCount: 2 },
];

test('milestoneRows lists today’s chapters in order, then deleted ones', () => {
  const rows = milestoneRows(milestone, texts, current);
  assert.deepEqual(rows.map((r) => [r.chapterId, r.state]), [
    ['c1', 'changed'],
    ['c4', 'unchanged'],
    ['c3', 'new'],
    ['c2', 'deleted'],
  ]);
});

test('milestoneRows fills titles, words and changes per state', () => {
  const [changed, unchanged, added, deleted] = milestoneRows(milestone, texts, current);
  assert.deepEqual(changed, {
    chapterId: 'c1', title: 'One', state: 'changed', snapshotId: 's1',
    wordsThen: 3, wordsNow: 3, added: 1, removed: 1,
  });
  assert.deepEqual(unchanged, {
    chapterId: 'c4', title: 'Four', state: 'unchanged', snapshotId: 's4',
    wordsThen: 1, wordsNow: 1, added: 0, removed: 0,
  });
  assert.deepEqual(added, {
    chapterId: 'c3', title: 'Three', state: 'new', snapshotId: null,
    wordsThen: 0, wordsNow: 2, added: 2, removed: 0,
  });
  assert.deepEqual(deleted, {
    chapterId: 'c2', title: 'Two', state: 'deleted', snapshotId: 's2',
    wordsThen: 2, wordsNow: 0, added: 0, removed: 2,
  });
});

test('milestoneRows on an empty milestone and empty work', () => {
  assert.deepEqual(milestoneRows([], new Map(), []), []);
});
