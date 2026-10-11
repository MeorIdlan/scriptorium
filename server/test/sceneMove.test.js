import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveScene, chapterHtml, parseScenes } from '../src/services/sceneMarkers.js';

const hr = (id) => `<hr data-scene="${id}" data-status="draft" />`;
const ids = (html) => parseScenes(html).map((s) => s.id);
const texts = (html) => parseScenes(html).map((s) => s.text);

const three = `<div>Open.</div>${hr('a')}<div>A.</div>${hr('b')}<div>B.</div>`;

test('moves a scene down within a chapter', () => {
  const out = moveScene({ srcHtml: three, dstHtml: three, sceneId: 'a', toIndex: 2, sameChapter: true });
  assert.equal(out.srcHtml, out.dstHtml);
  assert.deepEqual(texts(out.srcHtml), ['Open.', 'B.', 'A.']);
});

test('moves a scene up in front of the card-less opening, which gets a marker', () => {
  const out = moveScene({ srcHtml: three, dstHtml: three, sceneId: 'b', toIndex: 0, sameChapter: true });
  assert.deepEqual(texts(out.srcHtml), ['B.', 'Open.', 'A.']);
  const list = ids(out.srcHtml);
  assert.equal(list[0], 'b');
  assert.match(list[1], /^scn_\d+_[0-9a-f]{6}$/);
});

test('moving the opening scene gives it a marker so it stays separate', () => {
  const out = moveScene({ srcHtml: three, dstHtml: three, sceneId: 'opening', toIndex: 1, sameChapter: true });
  assert.deepEqual(texts(out.srcHtml), ['A.', 'Open.', 'B.']);
  assert.ok(ids(out.srcHtml).every(Boolean));
});

test('moves a scene to another chapter at an index', () => {
  const dst = `<div>X.</div>${hr('x')}<div>Y.</div>`;
  const out = moveScene({ srcHtml: three, dstHtml: dst, sceneId: 'a', toIndex: 1, sameChapter: false });
  assert.deepEqual(texts(out.srcHtml), ['Open.', 'B.']);
  assert.deepEqual(texts(out.dstHtml), ['X.', 'A.', 'Y.']);
});

test('moving into a chapter without markers keeps its text a separate scene', () => {
  const out = moveScene({ srcHtml: three, dstHtml: '<div>Whole.</div>', sceneId: 'b', toIndex: 0, sameChapter: false });
  assert.deepEqual(texts(out.dstHtml), ['B.', 'Whole.']);
  assert.ok(ids(out.dstHtml).every(Boolean));
});

test('moving into an empty chapter', () => {
  const out = moveScene({ srcHtml: three, dstHtml: '', sceneId: 'a', toIndex: 0, sameChapter: false });
  assert.deepEqual(texts(out.dstHtml), ['A.']);
});

test('reports NO_CHANGE, NOT_FOUND and INVALID_INDEX', () => {
  assert.deepEqual(moveScene({ srcHtml: three, dstHtml: three, sceneId: 'a', toIndex: 1, sameChapter: true }), { error: 'NO_CHANGE' });
  assert.deepEqual(moveScene({ srcHtml: three, dstHtml: three, sceneId: 'zz', toIndex: 0, sameChapter: true }), { error: 'NOT_FOUND' });
  assert.deepEqual(moveScene({ srcHtml: three, dstHtml: three, sceneId: 'a', toIndex: 3, sameChapter: true }), { error: 'INVALID_INDEX' });
  assert.deepEqual(moveScene({ srcHtml: three, dstHtml: '', sceneId: 'a', toIndex: -1, sameChapter: false }), { error: 'INVALID_INDEX' });
  assert.deepEqual(moveScene({ srcHtml: three, dstHtml: '', sceneId: 'a', toIndex: 1.5, sameChapter: false }), { error: 'INVALID_INDEX' });
});

test('a blank opening stays in place as a prefix', () => {
  const src = `<div><br /></div>${hr('a')}<div>A.</div>${hr('b')}<div>B.</div>`;
  const out = moveScene({ srcHtml: src, dstHtml: src, sceneId: 'b', toIndex: 0, sameChapter: true });
  assert.ok(out.srcHtml.startsWith('<div><br /></div>'));
  assert.deepEqual(texts(out.srcHtml), ['B.', 'A.']);
});

test('chapterHtml converts plain text and escapes it', () => {
  assert.equal(chapterHtml({ contentHtml: '<div>Kept</div>', content: 'x' }), '<div>Kept</div>');
  assert.equal(chapterHtml({ contentHtml: '', content: 'A & B\n\n<c>' }), 'A &amp; B<br /><br />&lt;c&gt;');
  assert.equal(chapterHtml({}), '');
});
