import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer } from 'docx';
import { chapterToHTML, docxBody, SCENE_BREAK } from '../src/services/exportService.js';
import { unzip } from './support/zip.js';

const run = (text, flags = {}) => ({ text, bold: false, italic: false, underline: false, ...flags });
const plain = (text) => [run(text)];

test('EPUB chapter HTML has one <p> per paragraph and a centred break between scenes', () => {
  const html = chapterToHTML({
    title: 'One & Two',
    notes: '',
    scenes: [[plain('A1'), plain('A2\nline')], [plain('B1')]],
  });
  assert.equal(
    html,
    '<h1>One &amp; Two</h1><p>A1</p><p>A2<br/>line</p><p style="text-align:center">* * *</p><p>B1</p>'
  );
  assert.equal(SCENE_BREAK, '* * *');
});

test('EPUB chapter HTML renders styled runs and keeps scene breaks', () => {
  const html = chapterToHTML({
    title: 'T',
    notes: '',
    scenes: [[[run('a', { bold: true }), run(' & b', { italic: true })]], [[run('c', { underline: true })]]],
  });
  assert.equal(
    html,
    '<h1>T</h1><p><strong>a</strong><em> &amp; b</em></p><p style="text-align:center">* * *</p>' +
      '<p><span style="text-decoration: underline">c</span></p>'
  );
});

test('EPUB chapter HTML for an empty chapter', () => {
  assert.equal(chapterToHTML({ title: 'E', notes: '', scenes: [] }), '<h1>E</h1><p></p>');
});

test('DOCX body has a centred break paragraph between scenes', () => {
  const paragraphs = docxBody([[plain('A1'), plain('A2')], [plain('B1')]]);
  assert.equal(paragraphs.length, 4);
  const json = JSON.stringify(paragraphs[2]);
  assert.ok(json.includes('* * *'));
  assert.ok(json.includes('center'));
});

const documentXml = async (paragraphs) => {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }));
  return (await unzip(buffer)).get('word/document.xml').toString('utf8');
};

test('DOCX body sets bold, italics and underline on runs and keeps line breaks', async () => {
  const xml = await documentXml(
    docxBody([[[run('a', { bold: true, italic: true, underline: true }), run('b\nc', { bold: true })]]])
  );
  const [a, b, c] = xml.match(/<w:r>.*?<\/w:r>/g);
  assert.ok(a.includes('<w:b/>') && a.includes('<w:i/>') && a.includes('<w:u w:val="single"/>') && a.includes('>a</w:t>'));
  assert.ok(b.includes('<w:b/>') && !b.includes('<w:i/>') && !b.includes('<w:u ') && b.includes('>b</w:t>'));
  assert.ok(c.includes('<w:b/>') && c.includes('<w:br/>') && c.includes('>c</w:t>'), 'the line break keeps the run style');
});
