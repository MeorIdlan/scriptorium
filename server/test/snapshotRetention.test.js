import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinSnapshots } from '../src/services/snapshotRetention.js';

const NOW = '2026-10-11T12:00:00.000Z';
const auto = (id, createdAt) => ({ id, kind: 'auto', createdAt });

test('keeps every automatic snapshot from the last 24 hours', () => {
  const snaps = [
    auto('a', '2026-10-11T11:00:00.000Z'),
    auto('b', '2026-10-11T10:00:00.000Z'),
    auto('c', '2026-10-10T13:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
});

test('keeps the newest per calendar day between 24 hours and 30 days', () => {
  const snaps = [
    auto('d5-early', '2026-10-05T08:00:00.000Z'),
    auto('d5-late', '2026-10-05T20:00:00.000Z'),
    auto('d5-mid', '2026-10-05T12:00:00.000Z'),
    auto('d6', '2026-10-06T08:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW).sort(), ['d5-early', 'd5-mid']);
});

test('keeps the newest per calendar week after 30 days', () => {
  // Epoch weeks start on Thursday; 2026-08-06 is a Thursday
  const snaps = [
    auto('aug7', '2026-08-07T09:00:00.000Z'),
    auto('aug10', '2026-08-10T09:00:00.000Z'),
    auto('aug13', '2026-08-13T09:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), ['aug7']);
});

test('never returns named or milestone snapshots', () => {
  const snaps = [
    { id: 'n1', kind: 'named', createdAt: '2026-10-05T08:00:00.000Z' },
    { id: 'n2', kind: 'named', createdAt: '2026-10-05T09:00:00.000Z' },
    { id: 'm1', kind: 'milestone', createdAt: '2026-08-07T09:00:00.000Z' },
    { id: 'm2', kind: 'milestone', createdAt: '2026-08-08T09:00:00.000Z' },
    auto('a1', '2026-10-05T10:00:00.000Z'),
  ];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
});

test('a snapshot kept today is still kept a day later', () => {
  const snaps = [auto('d5', '2026-10-05T20:00:00.000Z'), auto('d6', '2026-10-06T08:00:00.000Z')];
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
  assert.deepEqual(thinSnapshots(snaps, '2026-10-12T12:00:00.000Z'), []);
});

test('an older entry goes once a newer one in its day passes 24 hours', () => {
  const snaps = [auto('late', '2026-10-10T20:00:00.000Z'), auto('early', '2026-10-10T08:00:00.000Z')];
  // 'late' is under 24 h old, so 'early' is the only one in the day tier
  assert.deepEqual(thinSnapshots(snaps, NOW), []);
  assert.deepEqual(thinSnapshots(snaps, '2026-10-11T21:00:00.000Z'), ['early']);
});

test('handles empty input and unparseable dates', () => {
  assert.deepEqual(thinSnapshots([], NOW), []);
  assert.deepEqual(thinSnapshots([auto('x', 'not a date')], NOW), []);
});
