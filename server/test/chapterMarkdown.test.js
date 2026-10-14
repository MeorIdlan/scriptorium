import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterMarkdown } from '../src/services/chapterMarkdown.js';

test('paragraphs are separated by a blank line', () => {
  assert.equal(chapterMarkdown('<p>One.</p><p>Two.</p>'), 'One.\n\nTwo.\n');
});

test('headings, emphasis and line breaks map to Markdown', () => {
  assert.equal(
    chapterMarkdown('<h1>Title</h1><p><b>Bold</b> and <em>soft</em><br>next</p>'),
    '# Title\n\n**Bold** and *soft*\\\nnext\n'
  );
});

test('underline keeps its text and drops the markup', () => {
  assert.equal(chapterMarkdown('<p><u>under</u>line</p>'), 'underline\n');
});

test('a scene marker becomes the scene break', () => {
  assert.equal(chapterMarkdown('<p>A</p><hr data-scene="s1"><p>B</p>'), 'A\n\n* * *\n\nB\n');
});

test('writer text that looks like Markdown is escaped', () => {
  assert.equal(chapterMarkdown('<p>*not bold* and # not heading</p>'), '\\*not bold\\* and # not heading\n');
  assert.equal(chapterMarkdown('<p># start</p>'), '\\# start\n');
  assert.equal(chapterMarkdown('<p>- item</p>'), '\\- item\n');
  assert.equal(chapterMarkdown('<p>1. first</p>'), '1\\. first\n');
});

test('entities are decoded and then escaped where needed', () => {
  assert.equal(chapterMarkdown('<p>Tom &amp; Jerry &lt;3</p>'), 'Tom & Jerry \\<3\n');
});

test('blockquotes prefix every line, including blank ones', () => {
  assert.equal(
    chapterMarkdown('<blockquote><p>Quoted</p><p>Second</p></blockquote>'),
    '> Quoted\n>\n> Second\n'
  );
});

test('a paragraph holding only a line break is skipped, and a trailing break is dropped', () => {
  assert.equal(chapterMarkdown('<p><br></p><p>Kept<br></p>'), 'Kept\n');
});

test('empty input gives an empty string', () => {
  assert.equal(chapterMarkdown(''), '');
});
