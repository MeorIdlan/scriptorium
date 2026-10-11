import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  newSceneId,
  sceneList,
  sceneAtNode,
  sceneLabel,
  sceneFieldError,
  markerHtml,
  writeSceneCard,
  lockMarkers,
  liftMarker,
  positionOptions,
} from '../src/utils/scenes.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}
const hr = (id, extra = '') => `<hr data-scene="${id}" data-status="draft"${extra}>`;

test('newSceneId shape', () => {
  assert.match(newSceneId(5), /^scn_5_[0-9a-f]{6}$/);
});

test('no markers: one whole-chapter scene', () => {
  const list = sceneList(editor('<div>One two.</div><div>Three.</div>'));
  assert.equal(list.length, 1);
  assert.equal(list[0].id, null);
  assert.equal(list[0].wordCount, 3);
});

test('splits at markers with cards and indexes', () => {
  const root = editor(`<div>Open.</div>${hr('a', ' data-title="Well" data-pov="Mara"')}<div>At the well.</div>${hr('b')}<div>Road.</div>`);
  const list = sceneList(root);
  assert.deepEqual(list.map((s) => [s.id, s.title, s.pov, s.wordCount, s.index]), [
    [null, '', '', 1, 0],
    ['a', 'Well', 'Mara', 3, 1],
    ['b', '', '', 1, 2],
  ]);
  assert.equal(list[1].text, 'At the well.');
});

test('a blank opening is not listed', () => {
  const list = sceneList(editor(`<div><br></div>${hr('a')}<div>A.</div>`));
  assert.deepEqual(list.map((s) => s.id), ['a']);
});

test('sceneAtNode finds the scene holding a top-level node', () => {
  const root = editor(`<div>Open.</div>${hr('a')}<div>A1.</div><div>A2.</div>${hr('b')}<div>B.</div>`);
  const kids = [...root.childNodes];
  assert.equal(sceneAtNode(root, kids[0]), 0);
  assert.equal(sceneAtNode(root, kids[3]), 1);
  assert.equal(sceneAtNode(root, kids[1]), 1);
  assert.equal(sceneAtNode(root, kids[5]), 2);
  assert.equal(sceneAtNode(root, null), -1);
});

test('sceneAtNode in a blank opening maps to the first scene', () => {
  const root = editor(`<div><br></div>${hr('a')}<div>A.</div>`);
  assert.equal(sceneAtNode(root, root.childNodes[0]), 0);
});

test('sceneLabel uses the title or a number', () => {
  assert.equal(sceneLabel({ title: ' Well ', index: 1 }), 'Well');
  assert.equal(sceneLabel({ title: '', index: 2 }), 'Scene 3');
});

test('sceneFieldError reports over-long fields', () => {
  assert.equal(sceneFieldError('title', 'x'.repeat(120)), '');
  assert.equal(sceneFieldError('title', 'x'.repeat(130)), '130 / 120 characters. Shorten it to save.');
  assert.equal(sceneFieldError('summary', 'y'.repeat(1200)), '1,200 / 600 characters. Shorten it to save.');
});

test('markerHtml escapes values and omits blanks', () => {
  assert.equal(
    markerHtml({ id: 'scn_1_abcdef', title: 'A "quoted" <b>', pov: ' ', status: 'done' }),
    '<hr data-scene="scn_1_abcdef" data-title="A &quot;quoted&quot; &lt;b&gt;" data-status="done" contenteditable="false">'
  );
  assert.match(markerHtml({ id: 'x', status: 'bogus' }), /data-status="draft"/);
});

test('writeSceneCard sets and clears attributes and fires input', () => {
  const root = editor(`<div>Open.</div>${hr('a', ' data-title="Old" data-pov="Mara"')}<div>A.</div>`);
  let inputs = 0;
  root.addEventListener('input', () => inputs++);
  assert.equal(writeSceneCard(root, 1, { title: 'New', pov: '', location: 'Gate', status: 'revise', summary: '' }), true);
  const marker = root.querySelector('hr');
  assert.equal(marker.getAttribute('data-title'), 'New');
  assert.equal(marker.hasAttribute('data-pov'), false);
  assert.equal(marker.getAttribute('data-location'), 'Gate');
  assert.equal(marker.getAttribute('data-status'), 'revise');
  assert.equal(inputs, 1);
});

test('writeSceneCard on the opening scene inserts a marker at the start', () => {
  const root = editor(`<div>Open.</div>${hr('a')}<div>A.</div>`);
  writeSceneCard(root, 0, { title: 'Prologue', status: 'draft' });
  const first = root.firstChild;
  assert.equal(first.tagName, 'HR');
  assert.equal(first.getAttribute('data-title'), 'Prologue');
  assert.match(first.getAttribute('data-scene'), /^scn_\d+_[0-9a-f]{6}$/);
  assert.equal(sceneList(root).length, 2);
});

test('lockMarkers makes top-level markers non-editable', () => {
  const root = editor(`<div>Open.</div>${hr('a')}<div>A.</div>`);
  assert.equal(lockMarkers(root), 1);
  assert.equal(root.querySelector('hr').getAttribute('contenteditable'), 'false');
  assert.equal(lockMarkers(root), 0);
});

test('liftMarker moves a nested marker out and keeps the text after it', () => {
  const root = editor(`<div>Before.${hr('a')}After.</div><div>Next.</div>`);
  liftMarker(root, root.querySelector('hr'));
  assert.equal(root.innerHTML, `<div>Before.</div><hr data-scene="a" data-status="draft"><div>After.</div><div>Next.</div>`);
});

test('liftMarker with nothing after the marker', () => {
  const root = editor(`<div>Before.${hr('a')}</div>`);
  liftMarker(root, root.querySelector('hr'));
  assert.equal(root.innerHTML, `<div>Before.</div><hr data-scene="a" data-status="draft">`);
});

test('positionOptions for another chapter', () => {
  const dest = [{ title: 'Open', index: 0 }, { title: '', index: 1 }, { title: 'Last', index: 2 }];
  assert.deepEqual(positionOptions(dest), [
    { label: 'At the start', toIndex: 0 },
    { label: 'After: Open', toIndex: 1 },
    { label: 'After: Scene 2', toIndex: 2 },
    { label: 'At the end', toIndex: 3 },
  ]);
  assert.deepEqual(positionOptions([]), [{ label: 'At the start', toIndex: 0 }]);
});

test('positionOptions within the same chapter skips the current place', () => {
  const dest = [{ title: 'A', index: 0 }, { title: 'B', index: 1 }, { title: 'C', index: 2 }];
  assert.deepEqual(positionOptions(dest, { index: 1 }), [
    { label: 'At the start', toIndex: 0 },
    { label: 'At the end', toIndex: 2 },
  ]);
});
