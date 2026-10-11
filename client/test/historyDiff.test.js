import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryDiff, collapseUnchanged, hasTextChanges } from '../src/utils/historyDiff.js';
import { paragraphSpans } from '../src/utils/polishDiff.js';

const texts = (segments) => segments.map((s) => s.text ?? s.parts.map((p) => p.text).join('|'));

test('identical texts give only equal segments', () => {
  const diff = buildHistoryDiff('One. Two.\nThree.', 'One. Two.\nThree.');
  assert.ok(diff.segments.every((s) => s.type === 'equal'));
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.paragraphLevel, false);
});

test('trailing whitespace alone is not a change', () => {
  const diff = buildHistoryDiff('One. Two.', 'One.  Two.');
  assert.ok(diff.segments.every((s) => s.type === 'equal'));
});

test('a one-word edit counts one word each way', () => {
  const diff = buildHistoryDiff('Start. The cat sat. End.', 'Start. The dog sat. End.');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  const change = diff.segments.find((s) => s.type === 'change');
  assert.deepEqual(change.parts, [
    { type: 'same', text: 'The ' },
    { type: 'del', text: 'cat' },
    { type: 'add', text: 'dog' },
    { type: 'same', text: ' sat. ' },
  ]);
});

test('an added paragraph counts its words', () => {
  const diff = buildHistoryDiff('A start.', 'A start.\nBrand new line.');
  assert.equal(diff.added, 3);
  assert.equal(diff.removed, 0);
});

test('falls back to paragraphs when sentences are too many to align', () => {
  // 6 × 6 sentences exceed 20 cells; the changed paragraph's 2 × 2 words × 4 don't
  const before = 'A. B. C. D. E.\nCat sat.';
  const after = 'A. B. C. D. E.\nDog sat.';
  const diff = buildHistoryDiff(before, after, { maxCells: 20 });
  assert.equal(diff.paragraphLevel, true);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.deepEqual(texts(diff.segments), ['A. B. C. D. E.\n', 'Cat|Dog| sat.']);
});

test('a change too large to compare word by word shows as one removal and one addition', () => {
  const diff = buildHistoryDiff('Alpha beta gamma.', 'Delta beta epsilon.', { maxCells: 8 });
  const change = diff.segments.find((s) => s.type === 'change');
  assert.deepEqual(change.parts, [
    { type: 'del', text: 'Alpha beta gamma.' },
    { type: 'add', text: 'Delta beta epsilon.' },
  ]);
  assert.equal(diff.added, 3);
  assert.equal(diff.removed, 3);
});

test('paragraphSpans splits after each line break and round-trips', () => {
  const text = 'A\nB\n\nC';
  const spans = paragraphSpans(text);
  assert.deepEqual(spans.map((s) => s.text), ['A\n', 'B\n', '\n', 'C']);
  assert.equal(spans.map((s) => s.text).join(''), text);
  assert.deepEqual(paragraphSpans(''), []);
});

const change = { type: 'change', parts: [{ type: 'add', text: 'X' }] };

test('collapseUnchanged hides long unchanged stretches, keeping context next to changes', () => {
  const segments = [
    { type: 'equal', text: 'P1\nP2\n' },
    { type: 'equal', text: 'P3\nP4\nP5\nThe ' },
    change,
    { type: 'equal', text: ' sat.\nQ1\nQ2\nQ3\nQ4' },
  ];
  const out = collapseUnchanged(segments);
  assert.deepEqual(out, [
    { type: 'collapsed', text: 'P1\nP2\nP3\nP4\n', paragraphs: 4 },
    { type: 'equal', text: 'P5\nThe ' },
    change,
    { type: 'equal', text: ' sat.\nQ1\n' },
    { type: 'collapsed', text: 'Q2\nQ3\nQ4', paragraphs: 3 },
  ]);
});

test('collapseUnchanged keeps short stretches between changes', () => {
  const segments = [change, { type: 'equal', text: 'A\nB\nC\n' }, change];
  assert.deepEqual(collapseUnchanged(segments), [change, { type: 'equal', text: 'A\nB\nC\n' }, change]);
});

test('collapseUnchanged hides the middle of a long stretch between changes', () => {
  const segments = [change, { type: 'equal', text: 'end.\nA\nB\nC\nD\nstart ' }, change];
  assert.deepEqual(collapseUnchanged(segments), [
    change,
    { type: 'equal', text: 'end.\nA\n' },
    { type: 'collapsed', text: 'B\nC\n', paragraphs: 2 },
    { type: 'equal', text: 'D\nstart ' },
    change,
  ]);
});

test('a comparison too large even for paragraphs shows the changed stretch as one change', () => {
  const before = 'Same start.\nA one.\nB two.\nC three.\nSame end.';
  const after = 'Same start.\nA uno.\nB two.\nC tres.\nSame end.';
  const diff = buildHistoryDiff(before, after, { maxCells: 4 });
  assert.equal(diff.paragraphLevel, true);
  assert.deepEqual(diff.segments.map((s) => s.type), ['equal', 'change', 'equal']);
  assert.equal(diff.segments[0].text, 'Same start.\n');
  assert.equal(diff.segments[2].text, 'Same end.');
});

test('hasTextChanges ignores whitespace-only differences', () => {
  assert.equal(hasTextChanges(buildHistoryDiff('He  said hi.', 'He said hi.')), false);
  assert.equal(hasTextChanges(buildHistoryDiff('said hi', 'said hi')), false);
  assert.equal(hasTextChanges(buildHistoryDiff(' Lead.', 'Lead.')), false);
  assert.equal(hasTextChanges(buildHistoryDiff('The cat sat.', 'The dog sat.')), true);
  assert.equal(hasTextChanges(buildHistoryDiff('Wait.', 'Wait!')), true);
});
