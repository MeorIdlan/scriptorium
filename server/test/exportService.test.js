import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer } from 'docx';
import { chapterToHTML, coverSVG, docxBody, SCENE_BREAK } from '../src/services/exportService.js';
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

// Each <text> block of a cover: its font size and its unescaped tspan lines.
const unescapeXml = (text) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const coverBlocks = (svg) =>
  [...svg.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)].map(([, attrs, body]) => ({
    size: Number(attrs.match(/font-size="([\d.]+)"/)[1]),
    lines: [...body.matchAll(/<tspan [^>]*>(.*?)<\/tspan>/g)].map(([, text]) => unescapeXml(text)),
  }));
const fitsCover = (line, size, charWidth) => line.length * charWidth * size <= 1300;

test('cover title of 36+ characters wraps onto several lines that fit the cover', () => {
  const title = 'Tea & <Cake>: Ünïcode "Test" \'Run\' and a much longer subtitle';
  const [titleBlock] = coverBlocks(coverSVG({ title, author: 'Ann' }));
  assert.ok(titleBlock.lines.length > 1);
  for (const line of titleBlock.lines) assert.ok(line.length * 0.6 * titleBlock.size <= 1400, line);
  assert.equal(titleBlock.lines.join(' '), title);
});

test('a short title stays one 120 px line', () => {
  const [titleBlock] = coverBlocks(coverSVG({ title: 'Alpha', author: 'Ann' }));
  assert.deepEqual(titleBlock, { size: 120, lines: ['Alpha'] });
});

test('a single very long word is shrunk and broken to fit', () => {
  const word = 'abcdefghij'.repeat(6);
  const [titleBlock] = coverBlocks(coverSVG({ title: word, author: '' }));
  assert.ok(titleBlock.size >= 60);
  for (const line of titleBlock.lines) assert.ok(fitsCover(line, titleBlock.size, 0.55), line);
  assert.equal(titleBlock.lines.join(''), word);
});

test('a long author name wraps within 3 lines', () => {
  const author = 'Maximilian Alexander Bartholomew Fitzgerald-Worthington the Third of Somewhere';
  const [, authorBlock] = coverBlocks(coverSVG({ title: 'T', author }));
  assert.ok(authorBlock.size >= 40);
  assert.ok(authorBlock.lines.length > 1 && authorBlock.lines.length <= 3);
  for (const line of authorBlock.lines) assert.ok(fitsCover(line, authorBlock.size, 0.55), line);
  assert.equal(authorBlock.lines.join(' '), author);
});

test('no author text when the author is empty', () => {
  assert.equal(coverBlocks(coverSVG({ title: 'T', author: '' })).length, 1);
});

test('cover text is escaped', () => {
  const svg = coverSVG({ title: 'Tea & <Cake>', author: 'Ann & Bo <Writer>' });
  assert.ok(svg.includes('Tea &amp; &lt;Cake&gt;'));
  assert.ok(svg.includes('Ann &amp; Bo &lt;Writer&gt;'));
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;|#39;)/);
});
