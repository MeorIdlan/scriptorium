import { test } from 'node:test';
import assert from 'node:assert/strict';
import { povOptions, scenesForPov } from '../src/utils/sceneMap.js';

const chapters = [
  { id: 'c1', scenes: [{ id: null, pov: '' }, { id: 'a', pov: 'Mara ' }, { id: 'b', pov: 'tam' }] },
  { id: 'c2', scenes: [{ id: 'c', pov: 'mara' }, { id: 'd', pov: 'Tam' }, null] },
  { id: 'c3', scenes: [] },
  { id: 'c4' },
];

test('povOptions lists distinct POVs, first spelling wins', () => {
  assert.deepEqual(povOptions(chapters), ['Mara', 'tam']);
});

test('scenesForPov keeps the scene index and matches case-insensitively', () => {
  assert.deepEqual(scenesForPov(chapters[1], 'MARA').map((s) => [s.id, s.index]), [['c', 0]]);
  assert.equal(scenesForPov(chapters[0], '').length, 3);
  assert.equal(scenesForPov(chapters[3], 'Mara').length, 0);
});
