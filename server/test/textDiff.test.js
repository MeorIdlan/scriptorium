import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffStats } from '../src/services/textDiff.js';

test('identical texts have no changes', () => {
  assert.deepEqual(diffStats('One two.\nThree.', 'One two.\nThree.'), { added: 0, removed: 0 });
});

test('a one-word edit counts as one word each way', () => {
  assert.deepEqual(diffStats('The cat sat.\nIt rained.', 'The dog sat.\nIt rained.'), { added: 1, removed: 1 });
});

test('an added paragraph counts its words as added', () => {
  assert.deepEqual(diffStats('First line.', 'First line.\nA brand new one.'), { added: 4, removed: 0 });
});

test('a removed paragraph counts its words as removed', () => {
  assert.deepEqual(diffStats('Keep this.\nDrop these three.\nEnd.', 'Keep this.\nEnd.'), { added: 0, removed: 3 });
});

test('empty on either side', () => {
  assert.deepEqual(diffStats('', 'Two words.'), { added: 2, removed: 0 });
  assert.deepEqual(diffStats('Two words.', ''), { added: 0, removed: 2 });
  assert.deepEqual(diffStats('', ''), { added: 0, removed: 0 });
});

test('repeated paragraphs align', () => {
  assert.deepEqual(diffStats('Same.\nSame.\nSame.', 'Same.\nSame.'), { added: 0, removed: 1 });
});

test('a change too large to compare word by word counts every word in it', () => {
  const before = 'alpha beta gamma\nend';
  const after = 'alpha beta delta\nend';
  assert.deepEqual(diffStats(before, after), { added: 1, removed: 1 });
  assert.deepEqual(diffStats(before, after, { maxCells: 4 }), { added: 3, removed: 3 });
});

test('many paragraphs with spread-out edits still count only the edited words', () => {
  const paras = Array.from({ length: 10 }, (_, i) => `p${i} alpha beta`);
  const edited = [...paras];
  edited[2] = 'p2 alpha gamma';
  edited[8] = 'p8 alpha delta';
  // 7 × 7 changed-stretch paragraphs exceed 40 cells, but the 2 edited paragraphs fit
  assert.deepEqual(diffStats(paras.join('\n\n'), edited.join('\n\n'), { maxCells: 40 }), { added: 2, removed: 2 });
});
