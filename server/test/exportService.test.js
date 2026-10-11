import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterToHTML, docxBody, SCENE_BREAK } from '../src/services/exportService.js';

test('EPUB chapter HTML has one <p> per paragraph and a centred break between scenes', () => {
  const html = chapterToHTML({ title: 'One & Two', notes: '', scenes: [['A1', 'A2\nline'], ['B1']] });
  assert.equal(
    html,
    '<h1>One &amp; Two</h1><p>A1</p><p>A2<br/>line</p><p style="text-align:center">* * *</p><p>B1</p>'
  );
  assert.equal(SCENE_BREAK, '* * *');
});

test('EPUB chapter HTML for an empty chapter', () => {
  assert.equal(chapterToHTML({ title: 'E', notes: '', scenes: [] }), '<h1>E</h1><p></p>');
});

test('DOCX body has a centred break paragraph between scenes', () => {
  const paragraphs = docxBody([['A1', 'A2'], ['B1']]);
  assert.equal(paragraphs.length, 4);
  const json = JSON.stringify(paragraphs[2]);
  assert.ok(json.includes('* * *'));
  assert.ok(json.includes('center'));
});
