import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  getBlocks,
  blockPieces,
  pointToBlockOffset,
  chapterTargets,
  selectionTargets,
  batchTargets,
} from '../src/utils/editorBlocks.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

test('getBlocks treats a bare first line and each top-level div as blocks', () => {
  const root = editor('First <b>bold</b> line.<div>Second.</div><div><br></div><p>Third.</p>');
  assert.deepEqual(getBlocks(root).map((b) => b.text), ['First bold line.', 'Second.', '\n', 'Third.']);
});

test('blockPieces counts <br> and nested blocks as line breaks', () => {
  const root = editor('<div>One.<br>Two.<div>Nested.</div></div>');
  const { text, pieces } = blockPieces(getBlocks(root)[0].nodes);
  assert.equal(text, 'One.\nTwo.\nNested.');
  assert.deepEqual(pieces.map((p) => [p.kind, p.start, p.end]), [
    ['text', 0, 4],
    ['break', 4, 5],
    ['text', 5, 9],
    ['virtual', 9, 10],
    ['text', 10, 17],
  ]);
});

test('pointToBlockOffset maps text, element and root positions', () => {
  const root = editor('Intro <b>bold</b>.<div>Second <i>it</i>.</div>');
  const blocks = getBlocks(root);
  const bold = root.querySelector('b').firstChild;
  assert.deepEqual(pointToBlockOffset(root, blocks, bold, 2), { blockIndex: 0, offset: 8 });
  const div = root.querySelector('div');
  assert.deepEqual(pointToBlockOffset(root, blocks, div, 1), { blockIndex: 1, offset: 7 });
  assert.deepEqual(pointToBlockOffset(root, blocks, div, 3), { blockIndex: 1, offset: 10 });
  assert.deepEqual(pointToBlockOffset(root, blocks, root, root.childNodes.length), { blockIndex: 1, offset: 10 });
});

test('chapterTargets makes one trimmed target per non-blank block', () => {
  const root = editor('  Hello there.  <div><br></div><div>Next.</div>');
  assert.deepEqual(chapterTargets(getBlocks(root)), [
    { blockIndex: 0, start: 2, end: 14, text: 'Hello there.' },
    { blockIndex: 2, start: 0, end: 5, text: 'Next.' },
  ]);
});

test('selectionTargets expands a partial selection to whole sentences', () => {
  const root = editor('<div>One here. Two there. Three.</div>');
  const blocks = getBlocks(root);
  // selects "wo th" inside the second sentence
  const sel = { start: { blockIndex: 0, offset: 11 }, end: { blockIndex: 0, offset: 16 } };
  assert.deepEqual(selectionTargets(blocks, sel), [{ blockIndex: 0, start: 10, end: 20, text: 'Two there.' }]);
});

test('selectionTargets spans several blocks and skips blank ones', () => {
  const root = editor('<div>A one. A two.</div><div><br></div><div>B one. B two.</div>');
  const blocks = getBlocks(root);
  const sel = { start: { blockIndex: 0, offset: 9 }, end: { blockIndex: 2, offset: 3 } };
  assert.deepEqual(selectionTargets(blocks, sel), [
    { blockIndex: 0, start: 7, end: 13, text: 'A two.' },
    { blockIndex: 2, start: 0, end: 6, text: 'B one.' },
  ]);
});

test('batchTargets assigns ids and groups by word budget', () => {
  const t = (blockIndex, words) => {
    const text = Array.from({ length: words }, (_, i) => `w${i}.`).join(' ');
    return { blockIndex, start: 0, end: text.length, text };
  };
  const batches = batchTargets([t(0, 600), t(1, 600), t(2, 600)], 1500);
  assert.deepEqual(batches.map((b) => b.map((x) => x.id)), [['t1', 't2'], ['t3']]);
});

test('batchTargets splits an over-long target at sentence boundaries', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} here.`).join(' ');
  const [target] = chapterTargets(getBlocks(editor(`<div>${text}</div>`)));
  const batches = batchTargets([target], 50);
  const parts = batches.flat();
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.text.split(/\s+/).length <= 50));
  assert.equal(parts.map((p) => text.slice(p.start, p.end)).join(' '), text);
  assert.deepEqual(parts.map((p) => p.id), parts.map((_, i) => `t${i + 1}`));
});

test('blockPieces adds a line break after a nested block when text follows', () => {
  const root = editor('<div>A<div>B</div>C</div>');
  assert.equal(getBlocks(root)[0].text, 'A\nB\nC');
});

test('batchTargets caps the number of targets per batch', () => {
  const targets = Array.from({ length: 200 }, (_, i) => ({ blockIndex: i, start: 0, end: 9, text: '"No," she said.' }));
  const batches = batchTargets(targets, 1500);
  assert.ok(batches.every((b) => b.length <= 60), batches.map((b) => b.length).join(','));
  assert.equal(batches.flat().length, 200);
});
