import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterToLoad } from '../src/utils/chapterLoad.js';

const chapters = [{ id: 'c1' }, { id: 'c2' }];

test('loads the URL chapter, then the work current chapter, then the first', () => {
  assert.equal(chapterToLoad({ urlChapterId: 'c2', work: { currentChapterId: 'c1' }, chapters, editorChapterId: null, loadedChapterId: null }), 'c2');
  assert.equal(chapterToLoad({ urlChapterId: undefined, work: { currentChapterId: 'c2' }, chapters, editorChapterId: null, loadedChapterId: null }), 'c2');
  assert.equal(chapterToLoad({ urlChapterId: undefined, work: {}, chapters, editorChapterId: null, loadedChapterId: null }), 'c1');
});

test('nothing to load while the list is empty or the chapter is already loaded', () => {
  assert.equal(chapterToLoad({ urlChapterId: 'c1', work: {}, chapters: [], editorChapterId: null, loadedChapterId: null }), null);
  assert.equal(chapterToLoad({ urlChapterId: 'c1', work: {}, chapters, editorChapterId: 'c1', loadedChapterId: 'c1' }), null);
});

test('reloads when the editor remembers the chapter but this page has not loaded its text', () => {
  // Coming back from the Map: EditorContext still holds c2, the Main Room remounted empty
  assert.equal(chapterToLoad({ urlChapterId: 'c2', work: {}, chapters, editorChapterId: 'c2', loadedChapterId: null }), 'c2');
});
