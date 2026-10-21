import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphText, runLines, runsHTML, pdfFont } from '../src/services/exportRuns.js';

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
