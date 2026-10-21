import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphText } from '../src/services/exportRuns.js';

const run = (text, flags = {}) => ({ text, bold: false, italic: false, underline: false, ...flags });

test('paragraphText joins the run texts and ignores their flags', () => {
  assert.equal(paragraphText([run('a '), run('b', { bold: true }), run(' c', { italic: true, underline: true })]), 'a b c');
});

test('paragraphText of no runs is the empty string', () => {
  assert.equal(paragraphText([]), '');
});
