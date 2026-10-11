import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from 'htmlparser2';
import { sanitizeChapterHtml } from '../src/services/htmlService.js';

const hrs = (html) => parseDocument(html).children.filter((n) => n.name === 'hr').map((n) => n.attribs);

test('keeps a marker with only the scene attributes', () => {
  const out = sanitizeChapterHtml('<hr data-scene="scn_1_abcdef" data-title="T" data-pov="Mara" data-status="done" contenteditable="false" style="color:red" onclick="x()">');
  assert.deepEqual(hrs(out), [{ 'data-scene': 'scn_1_abcdef', 'data-title': 'T', 'data-pov': 'Mara', 'data-status': 'done' }]);
});

test('trims and caps fields and resets an unknown status', () => {
  const out = sanitizeChapterHtml(`<hr data-scene="scn_1_abcdef" data-title="  ${'x'.repeat(130)}  " data-summary="${'s'.repeat(700)}" data-status="nope">`);
  const [attrs] = hrs(out);
  assert.equal(attrs['data-title'].length, 120);
  assert.equal(attrs['data-summary'].length, 600);
  assert.equal(attrs['data-status'], 'draft');
});

test('drops empty fields', () => {
  const [attrs] = hrs(sanitizeChapterHtml('<hr data-scene="scn_1_abcdef" data-title="  " data-pov="">'));
  assert.deepEqual(attrs, { 'data-scene': 'scn_1_abcdef', 'data-status': 'draft' });
});

test('gives a duplicate id and a bare hr new ids', () => {
  const out = sanitizeChapterHtml('<hr data-scene="scn_1_abcdef"><div>a</div><hr data-scene="scn_1_abcdef"><div>b</div><hr><div>c</div>');
  const list = hrs(out).map((a) => a['data-scene']);
  assert.equal(list[0], 'scn_1_abcdef');
  assert.equal(new Set(list).size, 3);
  assert.ok(list.every((id) => /^scn_\d+_[0-9a-f]{6}$/.test(id)));
});

test('rejects an id with unsafe characters', () => {
  const [attrs] = hrs(sanitizeChapterHtml('<hr data-scene="a b<c">'));
  assert.match(attrs['data-scene'], /^scn_\d+_[0-9a-f]{6}$/);
});

test('escapes quotes in field values', () => {
  const out = sanitizeChapterHtml('<hr data-scene="scn_1_abcdef" data-title="She said &quot;no&quot;">');
  assert.equal(hrs(out)[0]['data-title'], 'She said "no"');
  assert.ok(!out.includes('data-title="She said "no""'));
});

test('ordinary chapter HTML is unchanged', () => {
  assert.equal(sanitizeChapterHtml('<div><b>Bold</b> text</div>'), '<div><b>Bold</b> text</div>');
});
