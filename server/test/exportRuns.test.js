import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph } from 'docx';
import { paragraphText, runLines, runsHTML, pdfFont, docxTextRuns } from '../src/services/exportRuns.js';
import { unzip } from './support/zip.js';

const run = (text, flags = {}) => ({ text, bold: false, italic: false, underline: false, ...flags });

test('paragraphText joins the run texts and ignores their flags', () => {
  assert.equal(paragraphText([run('a '), run('b', { bold: true }), run(' c', { italic: true, underline: true })]), 'a b c');
});

test('paragraphText of no runs is the empty string', () => {
  assert.equal(paragraphText([]), '');
});

test('runLines splits at line breaks and keeps the flags', () => {
  const lines = runLines([run('a ', { bold: true }), run('b\nc', { italic: true }), run('\n'), run('d', { underline: true })]);
  assert.deepEqual(lines, [
    [run('a ', { bold: true }), run('b', { italic: true })],
    [run('c', { italic: true })],
    [run('d', { underline: true })],
  ]);
});

test('runLines gives an empty line for a break with nothing on one side', () => {
  assert.deepEqual(runLines([run('\n')]), [[], []]);
});

test('runsHTML wraps bold, italic and underline and escapes the text', () => {
  const html = runsHTML([
    run('a & <b>', { bold: true }),
    run('"q"', { italic: true, underline: true }),
  ]);
  assert.equal(html, '<strong>a &amp; &lt;b&gt;</strong><em><span style="text-decoration: underline">&quot;q&quot;</span></em>');
});

test('runsHTML turns a line break into <br/> inside the run style', () => {
  assert.equal(runsHTML([run('a', { bold: true }), run('\nb')]), '<strong>a</strong><br/>b');
});

test('pdfFont picks the Helvetica variant for each bold and italic combination', () => {
  const fonts = { regular: 'R', bold: 'B', italic: 'I', boldItalic: 'BI' };
  assert.equal(pdfFont(fonts, run('x')), 'R');
  assert.equal(pdfFont(fonts, run('x', { bold: true })), 'B');
  assert.equal(pdfFont(fonts, run('x', { italic: true })), 'I');
  assert.equal(pdfFont(fonts, run('x', { bold: true, italic: true })), 'BI');
});

test('docxTextRuns writes no bold or italic setting on a plain run, so a style can decide it', async () => {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: docxTextRuns([run('plain'), run('heavy', { bold: true })]) })] }],
  });
  const xml = (await unzip(await Packer.toBuffer(doc))).get('word/document.xml').toString('utf8');
  const runXml = (text) => (xml.match(/<w:r>.*?<\/w:r>/g) || []).find((r) => r.includes(`>${text}</w:t>`));
  const plain = runXml('plain');
  assert.ok(plain, 'the plain run is in the XML');
  assert.ok(!plain.includes('<w:b'), `no bold setting on a plain run: ${plain}`);
  assert.ok(!plain.includes('<w:i'), `no italic setting on a plain run: ${plain}`);
  assert.ok(runXml('heavy').includes('<w:b/>'), 'a bold run is still bold');
});
