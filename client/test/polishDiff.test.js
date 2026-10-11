import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceSpans, splitSentences, diffSentences, diffWords, buildChanges } from '../src/utils/polishDiff.js';

test('splitSentences round-trips and keeps trailing whitespace on each piece', () => {
  const text = 'One. Two!  Three?\nFour… "Five," she said. (Six.) Seven';
  const pieces = splitSentences(text);
  assert.equal(pieces.join(''), text);
  assert.deepEqual(pieces, ['One. ', 'Two!  ', 'Three?\n', 'Four… ', '"Five," she said. ', '(Six.) ', 'Seven']);
});

test('splitSentences does not split after common abbreviations', () => {
  assert.deepEqual(splitSentences('Mr. Vell met Dr. Ash. They left.'), ['Mr. Vell met Dr. Ash. ', 'They left.']);
});

test('splitSentences splits dialogue that ends inside quotes', () => {
  assert.deepEqual(splitSentences('"Run!" She ran.'), ['"Run!" ', 'She ran.']);
});

test('splitSentences treats a line break as a boundary', () => {
  assert.deepEqual(splitSentences('Line one\nLine two'), ['Line one\n', 'Line two']);
  assert.deepEqual(splitSentences(''), []);
});

test('sentenceSpans gives offsets into the text', () => {
  assert.deepEqual(sentenceSpans('Ab. Cd.'), [
    { text: 'Ab. ', start: 0, end: 4 },
    { text: 'Cd.', start: 4, end: 7 },
  ]);
});

test('diffSentences finds a single changed sentence', () => {
  const segs = diffSentences('One. Two. Three.', 'One. Two, better. Three.');
  assert.deepEqual(segs, [
    { type: 'equal', text: 'One. ', start: 0, end: 5 },
    { type: 'change', fromText: 'Two. ', toText: 'Two, better. ', start: 5, end: 10 },
    { type: 'equal', text: 'Three.', start: 10, end: 16 },
  ]);
});

test('diffSentences merges a split sentence into one change', () => {
  const segs = diffSentences('A long one, then more. End.', 'A long one. Then more. End.');
  assert.deepEqual(segs.filter((s) => s.type === 'change'), [
    { type: 'change', fromText: 'A long one, then more. ', toText: 'A long one. Then more. ', start: 0, end: 23 },
  ]);
});

test('diffSentences handles deletion and insertion at the end', () => {
  assert.deepEqual(diffSentences('A. B.', 'A.').filter((s) => s.type === 'change'), [
    { type: 'change', fromText: 'B.', toText: '', start: 3, end: 5 },
  ]);
  assert.deepEqual(diffSentences('A.', 'A. B.').filter((s) => s.type === 'change'), [
    { type: 'change', fromText: '', toText: ' B.', start: 2, end: 2 },
  ]);
});

test('diffSentences treats trailing-whitespace-only differences as equal', () => {
  assert.ok(diffSentences('A. B.', 'A.  B.').every((s) => s.type === 'equal'));
  assert.ok(diffSentences('Same.', 'Same.').every((s) => s.type === 'equal'));
});

test('diffWords marks word-level edits and merges runs', () => {
  assert.deepEqual(diffWords('She walked very slowly.', 'She strode slowly.'), [
    { type: 'same', text: 'She ' },
    { type: 'del', text: 'walked very' },
    { type: 'add', text: 'strode' },
    { type: 'same', text: ' slowly.' },
  ]);
});

test('buildChanges maps changes to block offsets and leaves unchanged targets as equal text', () => {
  const targets = [
    { id: 't1', blockIndex: 2, start: 10, end: 26, text: 'One. Two. Three.' },
    { id: 't2', blockIndex: 3, start: 0, end: 5, text: 'Same.' },
    { id: 't3', blockIndex: 4, start: 0, end: 4, text: 'Gone' },
  ];
  const { segmentsByTarget, changes } = buildChanges(targets, [
    { id: 't1', text: 'One. Two, better. Three.' },
    { id: 't2', text: 'Same.' },
  ]);
  assert.deepEqual(changes, [
    { id: 't1-c1', targetId: 't1', blockIndex: 2, start: 15, end: 20, fromText: 'Two. ', toText: 'Two, better. ', status: 'pending' },
  ]);
  assert.deepEqual(segmentsByTarget.t1, [
    { type: 'equal', text: 'One. ' },
    { type: 'change', changeId: 't1-c1' },
    { type: 'equal', text: 'Three.' },
  ]);
  assert.deepEqual(segmentsByTarget.t2, [{ type: 'equal', text: 'Same.' }]);
  assert.deepEqual(segmentsByTarget.t3, [{ type: 'equal', text: 'Gone' }]);
});

test('diffSentences keeps one change in place among repeated sentences', () => {
  const same = 'She walked. ';
  const original = `${same}${same}${same}She walked.`;
  const first = diffSentences(original, `She strode. ${same}${same}She walked.`).filter((s) => s.type === 'change');
  assert.deepEqual(first, [{ type: 'change', fromText: 'She walked. ', toText: 'She strode. ', start: 0, end: 12 }]);
  const last = diffSentences(original, `${same}${same}${same}She strode.`).filter((s) => s.type === 'change');
  assert.deepEqual(last, [{ type: 'change', fromText: 'She walked.', toText: 'She strode.', start: 36, end: 47 }]);
});
