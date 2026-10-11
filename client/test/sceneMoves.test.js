import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveSceneRequest, destinationScenes, dropIndex } from '../src/utils/sceneMoves.js';

test('moveSceneRequest posts the move with "opening" for a card-less scene', async () => {
  const calls = [];
  const api = { post: async (path, body) => (calls.push([path, body]), { chapters: [] }) };
  await moveSceneRequest(api, 'w1', { chapterId: 'c1', scene: { id: null }, toChapterId: 'c2', toIndex: 0 });
  await moveSceneRequest(api, 'w1', { chapterId: 'c1', scene: { id: 'scn_a' }, toChapterId: 'c1', toIndex: 2 });
  assert.deepEqual(calls, [
    ['/works/w1/chapters/c1/scenes/move', { sceneId: 'opening', toChapterId: 'c2', toIndex: 0 }],
    ['/works/w1/chapters/c1/scenes/move', { sceneId: 'scn_a', toChapterId: 'c1', toIndex: 2 }],
  ]);
});

test('destinationScenes uses stored scenes, a whole chapter, or nothing', () => {
  assert.deepEqual(destinationScenes({ scenes: [{ id: null, title: '' }, { id: 'a', title: 'A' }] }), [
    { title: '', index: 0 },
    { title: 'A', index: 1 },
  ]);
  assert.deepEqual(destinationScenes({ scenes: [], wordCount: 120 }), [{ title: 'Whole chapter', index: 0 }]);
  assert.deepEqual(destinationScenes({ scenes: [], wordCount: 0 }), []);
});

test('dropIndex takes the target row place, or nothing on itself', () => {
  assert.equal(dropIndex(0, 2), 2);
  assert.equal(dropIndex(2, 0), 0);
  assert.equal(dropIndex(1, 1), null);
});
