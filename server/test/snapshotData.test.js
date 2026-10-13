import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSnapshotId, newMilestoneId, snapshotFields, snapshotsFromDraftHistory } from '../src/services/snapshotData.js';

test('ids have their prefix and are unique', () => {
  assert.match(newSnapshotId(), /^snap_\d+_[0-9a-f]{8}$/);
  assert.match(newMilestoneId(), /^ms_\d+_[0-9a-f]{8}$/);
  const ids = new Set(Array.from({ length: 200 }, newSnapshotId));
  assert.equal(ids.size, 200);
});

test('snapshotFields copies the chapter text and tags', () => {
  const chapter = { _id: 'ch_1', workId: 'w_1', title: 'One', content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2, threadIds: ['thr_a'] };
  assert.deepEqual(snapshotFields(chapter), {
    workId: 'w_1', chapterId: 'ch_1', chapterTitle: 'One',
    content: 'Hi there.', contentHtml: '<div>Hi there.</div>', wordCount: 2, threadIds: ['thr_a'],
  });
  assert.deepEqual(snapshotFields({ _id: 'c', workId: 'w', title: 'T' }), {
    workId: 'w', chapterId: 'c', chapterTitle: 'T', content: '', contentHtml: '', wordCount: 0, threadIds: [],
  });
});

test('snapshotsFromDraftHistory maps entries to automatic snapshots with fixed ids', () => {
  const chapter = {
    _id: 'ch_9', workId: 'w_9', title: 'Nine',
    draftHistory: [
      { savedAt: '2026-10-01T10:00:00.000Z', wordCount: 2, contentSnapshot: 'Old one.', htmlSnapshot: '<div>Old one.</div>' },
    ],
  };
  assert.deepEqual(snapshotsFromDraftHistory(chapter), [{
    _id: `snap_ch_9_${Date.parse('2026-10-01T10:00:00.000Z')}`,
    workId: 'w_9', chapterId: 'ch_9', chapterTitle: 'Nine', kind: 'auto', name: '', note: '', milestoneId: null,
    content: 'Old one.', contentHtml: '<div>Old one.</div>', wordCount: 2, createdAt: '2026-10-01T10:00:00.000Z',
  }]);
});

test('snapshotsFromDraftHistory keeps every entry that has text', () => {
  const chapter = {
    _id: 'c', workId: 'w', title: 'T', updatedAt: '2026-10-02T00:00:00.000Z',
    draftHistory: [
      { savedAt: 'garbage', contentSnapshot: 'x' },
      { savedAt: '2026-10-01T10:00:00.000Z', contentSnapshot: 'first' },
      { savedAt: '2026-10-01T10:00:00.000Z', contentSnapshot: 'second' },
      { savedAt: 'Thu, 01 Oct 2026 11:00:00 GMT', contentSnapshot: 'rfc' },
      {},
    ],
  };
  const docs = snapshotsFromDraftHistory(chapter);
  assert.deepEqual(docs.map((d) => [d.content, d.createdAt]), [
    ['x', '2026-10-02T00:00:00.000Z'],
    ['first', '2026-10-01T10:00:00.000Z'],
    ['second', '2026-10-01T10:00:00.000Z'],
    ['rfc', '2026-10-01T11:00:00.000Z'],
  ]);
  assert.equal(new Set(docs.map((d) => d._id)).size, 4);
  assert.equal(docs[2]._id, `snap_c_${Date.parse('2026-10-01T10:00:00.000Z')}_2`);
  assert.deepEqual(snapshotsFromDraftHistory({ _id: 'c', workId: 'w', title: 'T' }), []);
});
