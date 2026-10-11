import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { getBlocks } from '../src/utils/editorBlocks.js';
import { applyPolish } from '../src/utils/applyPolish.js';

function editor(html) {
  const { document } = parseHTML(`<html><body><div id="ed">${html}</div></body></html>`);
  return document.getElementById('ed');
}

// Builds an accepted change replacing `from` (first occurrence) in block `blockIndex`
function change(root, blockIndex, from, toText, status = 'accepted') {
  const text = getBlocks(root)[blockIndex].text;
  const start = text.indexOf(from);
  assert.ok(start >= 0, `"${from}" not in block ${blockIndex}`);
  return { id: `${blockIndex}-${start}`, blockIndex, start, end: start + from.length, fromText: from, toText, status };
}

const texts = (root) => getBlocks(root).map((b) => b.text);

test('keeps formatting outside the changed sentence', () => {
  const root = editor('<div>Keep <b>bold</b> here. She walked very slowly. <i>End</i> part.</div>');
  const before = texts(root);
  const result = applyPolish(root, [change(root, 0, 'She walked very slowly. ', 'She strode slowly. ')], before);
  assert.deepEqual(result, { applied: 1, skipped: 0 });
  assert.equal(root.innerHTML, '<div>Keep <b>bold</b> here. She strode slowly. <i>End</i> part.</div>');
});

test('applies several changes in one block from last to first', () => {
  const root = editor('<div>One. Two. Three.</div>');
  const before = texts(root);
  const changes = [change(root, 0, 'One. ', 'Uno. '), change(root, 0, 'Three.', 'Tres.')];
  applyPolish(root, changes, before);
  assert.equal(texts(root)[0], 'Uno. Two. Tres.');
});

test('replaces a range that crosses inline element boundaries and drops emptied elements', () => {
  const root = editor('<div>Start <b>mid dle</b> end. Tail.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Start mid dle end. ', 'Fresh start. ')], before);
  assert.equal(texts(root)[0], 'Fresh start. Tail.');
  assert.ok(!root.innerHTML.includes('<b></b>'));
});

test('keeps <br> line breaks and turns newlines in the rewrite into <br>', () => {
  const root = editor('<div>Line one.<br>Line two.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Line two.', 'Line 2a.\nLine 2b.')], before);
  assert.equal(root.innerHTML, '<div>Line one.<br>Line 2a.<br>Line 2b.</div>');
});

test('handles the bare first line before the first div', () => {
  const root = editor('Opening line. Second.<div>Next block.</div>');
  const before = texts(root);
  applyPolish(root, [change(root, 0, 'Opening line. ', 'An opening. '), change(root, 1, 'Next block.', 'The next block.')], before);
  assert.deepEqual(texts(root), ['An opening. Second.', 'The next block.']);
});

test('only applies accepted changes', () => {
  const root = editor('<div>One. Two.</div>');
  const before = texts(root);
  const result = applyPolish(root, [change(root, 0, 'One. ', 'X. ', 'rejected'), change(root, 0, 'Two.', 'Y.', 'pending')], before);
  assert.deepEqual(result, { applied: 0, skipped: 0 });
  assert.equal(texts(root)[0], 'One. Two.');
});

test('skips changes in a block whose text changed since polishing started', () => {
  const root = editor('<div>One. Two.</div><div>Three.</div>');
  const before = texts(root);
  const changes = [change(root, 0, 'Two.', 'Deux.'), change(root, 1, 'Three.', 'Trois.')];
  root.querySelector('div').firstChild.data = 'One. Two. Typed more.';
  assert.deepEqual(applyPolish(root, changes, before), { applied: 1, skipped: 1 });
  assert.deepEqual(texts(root), ['One. Two. Typed more.', 'Trois.']);
});

test('applies a pure insertion at the end of a block', () => {
  const root = editor('<div>One.</div>');
  const before = texts(root);
  applyPolish(root, [{ id: 'x', blockIndex: 0, start: 4, end: 4, fromText: '', toText: ' Added.', status: 'accepted' }], before);
  assert.equal(texts(root)[0], 'One. Added.');
});
