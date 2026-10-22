import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSceneId,
  parseScenes,
  sceneSummaries,
  chapterText,
  exportScenes,
} from '../src/services/sceneMarkers.js';
import { paragraphText } from '../src/services/exportRuns.js';

const hr = (id, extra = '') => `<hr data-scene="${id}" data-status="draft"${extra} />`;
const run = (text, flags = {}) => ({ text, bold: false, italic: false, underline: false, ...flags });
const plainTexts = (scenes) => scenes.map((scene) => scene.map(paragraphText));

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
  assert.deepEqual(plainTexts(exportScenes({ contentHtml: `<div>A.</div>${hr('scn_a')}<div>B.</div>`, content: 'ignored' })), [['A.'], ['B.']]);
  assert.deepEqual(plainTexts(exportScenes({ contentHtml: '', content: 'One.\n\nTwo.\nmore' })), [['One.', 'Two.\nmore']]);
  assert.deepEqual(exportScenes({ contentHtml: '', content: '' }), []);
  assert.deepEqual(plainTexts(exportScenes({ contentHtml: `${hr('scn_a')}<div><br /></div>${hr('scn_b')}<div>B.</div>` })), [['B.']]);
});

test('exportScenes keeps bold, italic and underline as run flags', () => {
  const html = '<div>a <b>b</b> <i>c</i> <u>d</u> <strong><em>e</em></strong></div>';
  assert.deepEqual(exportScenes({ contentHtml: html }), [
    [
      [
        run('a '),
        run('b', { bold: true }),
        run(' '),
        run('c', { italic: true }),
        run(' '),
        run('d', { underline: true }),
        run(' '),
        run('e', { bold: true, italic: true }),
      ],
    ],
  ]);
});

test('inline font-weight and font-style set the flags, normal clears them', () => {
  const html = '<div><span style="font-weight: 700">x</span><span style="font-style: italic">y</span><b>z<span style="font-weight: normal">w</span></b></div>';
  assert.deepEqual(exportScenes({ contentHtml: html }), [
    [[run('x', { bold: true }), run('y', { italic: true }), run('z', { bold: true }), run('w')]],
  ]);
});

test('every inline bold, underline and normal value is read', () => {
  const html =
    '<div><span style="text-decoration: underline">u</span>|<span style="font-weight: bold">b</span>|<span style="font-weight: 600">c</span>|<span style="font-weight: bolder">d</span>|<span style="text-decoration: underline overline">e</span>|<b>k<span style="font-weight: 400">l</span></b></div>';
  assert.deepEqual(exportScenes({ contentHtml: html }), [
    [
      [
        run('u', { underline: true }),
        run('|'),
        run('b', { bold: true }),
        run('|'),
        run('c', { bold: true }),
        run('|'),
        run('d', { bold: true }),
        run('|'),
        run('e', { underline: true }),
        run('|'),
        run('k', { bold: true }),
        run('l'),
      ],
    ],
  ]);
});

test('plain text of styled paragraphs matches the old paragraph strings', () => {
  const fixtures = [
    '<div>One two.</div><div>Three.</div>',
    '',
    `<div>Opening.</div>${hr('scn_a', ' data-title="The well"')}<div>Second scene.</div>`,
    `<div><br /></div>${hr('scn_a')}<div>Only.</div>`,
    '<div>Before<hr data-scene="scn_x" />after</div>',
    'First line<div>Div one</div><p>Para</p><div>Line a<br />Line b</div><div>Outer<div>Inner</div>tail</div>',
    'Para one.<br /><br />Para two.<br />Still two.',
    '<div>Tom &amp; Jerry &lt;3</div>',
    `<div>Open here.</div>${hr('scn_a')}<div>One two three.</div>`,
    `${hr('scn_a')}<div><br /></div>${hr('scn_b')}<div>B.</div>`,
    `<div>A one.</div>${hr('scn_a')}<div>B one.</div><div>B two.</div>`,
  ];
  for (const html of fixtures) {
    const expected = parseScenes(html)
      .map((s) => s.paragraphs)
      .filter((p) => p.length);
    assert.deepEqual(plainTexts(exportScenes({ contentHtml: html })), expected, html);
  }
});

test('a bold span across a blank-line split stays bold in both paragraphs', () => {
  assert.deepEqual(exportScenes({ contentHtml: '<div><b>one<br><br>two</b></div>' }), [
    [[run('one', { bold: true })], [run('two', { bold: true })]],
  ]);
});

test('edge whitespace runs are trimmed away', () => {
  assert.deepEqual(exportScenes({ contentHtml: '<div><i> </i>text<b> </b></div>' }), [[[run('text')]]]);
});

test('a <br> inside a styled run is kept as \\n with the style', () => {
  assert.deepEqual(exportScenes({ contentHtml: '<div><i>a<br>b</i></div>' }), [[[run('a\nb', { italic: true })]]]);
});

test('legacy plain content gives unstyled runs', () => {
  assert.deepEqual(exportScenes({ contentHtml: '', content: 'One.\n\nTwo.' }), [[[run('One.')], [run('Two.')]]]);
});
