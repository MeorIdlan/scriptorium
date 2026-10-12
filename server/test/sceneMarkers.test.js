import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSceneId,
  parseScenes,
  sceneSummaries,
  chapterText,
  exportScenes,
} from '../src/services/sceneMarkers.js';

const hr = (id, extra = '') => `<hr data-scene="${id}" data-status="draft"${extra} />`;

test('newSceneId has the scn_<ms>_<6 hex> shape', () => {
  assert.match(newSceneId(1791700000000), /^scn_1791700000000_[0-9a-f]{6}$/);
});

test('a chapter without markers is one scene with no card', () => {
  const scenes = parseScenes('<div>One two.</div><div>Three.</div>');
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].id, null);
  assert.deepEqual(scenes[0].paragraphs, ['One two.', 'Three.']);
  assert.equal(scenes[0].wordCount, 3);
  assert.deepEqual(sceneSummaries('<div>One two.</div>'), []);
});

test('an empty chapter is one empty scene', () => {
  const scenes = parseScenes('');
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].wordCount, 0);
});

test('splits at top-level markers and reads card fields', () => {
  const html = `<div>Opening.</div>${hr('scn_a', ' data-title="The well" data-pov="Mara" data-location="Old town" data-summary="She finds it."')}<div>Second scene.</div>`;
  const scenes = parseScenes(html);
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].id, null);
  assert.equal(scenes[0].text, 'Opening.');
  assert.deepEqual(
    { id: scenes[1].id, title: scenes[1].title, pov: scenes[1].pov, location: scenes[1].location, summary: scenes[1].summary, status: scenes[1].status },
    { id: 'scn_a', title: 'The well', pov: 'Mara', location: 'Old town', summary: 'She finds it.', status: 'draft' }
  );
  assert.equal(scenes[1].wordCount, 2);
});

test('an opening without text is not a scene', () => {
  const scenes = parseScenes(`<div><br /></div>${hr('scn_a')}<div>Only.</div>`);
  assert.deepEqual(scenes.map((s) => s.id), ['scn_a']);
});

test('an unknown status reads as draft', () => {
  const [, scene] = parseScenes(`<div>A</div><hr data-scene="scn_b" data-status="weird" /><div>B</div>`);
  assert.equal(scene.status, 'draft');
});

test('an hr nested in a block does not split', () => {
  const scenes = parseScenes('<div>Before<hr data-scene="scn_x" />after</div>');
  assert.equal(scenes.length, 1);
  assert.deepEqual(scenes[0].paragraphs, ['Before\nafter']);
});

test('paragraphs follow the editor block model', () => {
  const [scene] = parseScenes('First line<div>Div one</div><p>Para</p><div>Line a<br />Line b</div><div>Outer<div>Inner</div>tail</div>');
  assert.deepEqual(scene.paragraphs, ['First line', 'Div one', 'Para', 'Line a\nLine b', 'Outer\nInner\ntail']);
});

test('blank lines inside a plain-text run split paragraphs', () => {
  const [scene] = parseScenes('Para one.<br /><br />Para two.<br />Still two.');
  assert.deepEqual(scene.paragraphs, ['Para one.', 'Para two.\nStill two.']);
});

test('entities are decoded', () => {
  const [scene] = parseScenes('<div>Tom &amp; Jerry &lt;3</div>');
  assert.equal(scene.text, 'Tom & Jerry <3');
});

test('sceneSummaries lists every scene with word counts when markers exist', () => {
  const html = `<div>Open here.</div>${hr('scn_a', ' data-title="T"')}<div>One two three.</div>`;
  assert.deepEqual(sceneSummaries(html), [
    { id: null, title: '', pov: '', location: '', status: 'draft', summary: '', wordCount: 2, threadIds: [] },
    { id: 'scn_a', title: 'T', pov: '', location: '', status: 'draft', summary: '', wordCount: 3, threadIds: [] },
  ]);
});

test('chapterText joins scenes with a blank line', () => {
  assert.equal(chapterText(`<div>A one.</div>${hr('scn_a')}<div>B one.</div><div>B two.</div>`), 'A one.\n\nB one.\nB two.');
});

test('exportScenes reads HTML when present and plain text otherwise', () => {
  assert.deepEqual(exportScenes({ contentHtml: `<div>A.</div>${hr('scn_a')}<div>B.</div>`, content: 'ignored' }), [['A.'], ['B.']]);
  assert.deepEqual(exportScenes({ contentHtml: '', content: 'One.\n\nTwo.\nmore' }), [['One.', 'Two.\nmore']]);
  assert.deepEqual(exportScenes({ contentHtml: '', content: '' }), []);
  assert.deepEqual(exportScenes({ contentHtml: `${hr('scn_a')}<div><br /></div>${hr('scn_b')}<div>B.</div>` }), [['B.']]);
});
