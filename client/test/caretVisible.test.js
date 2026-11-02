import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caretScrollDelta } from '../src/utils/caretVisible.js';

const view = { viewTop: 100, viewBottom: 500, margin: 24 };

test('a caret inside the visible band needs no scrolling', () => {
  assert.equal(caretScrollDelta({ caretTop: 300, caretBottom: 322, ...view }), 0);
  assert.equal(caretScrollDelta({ caretTop: 124, caretBottom: 146, ...view }), 0);
  assert.equal(caretScrollDelta({ caretTop: 454, caretBottom: 476, ...view }), 0);
});

test('a caret under the keyboard scrolls down by how far it is past the margin', () => {
  assert.equal(caretScrollDelta({ caretTop: 678, caretBottom: 700, ...view }), 224);
  assert.equal(caretScrollDelta({ caretTop: 470, caretBottom: 492, ...view }), 16);
});

test('a caret above the visible band scrolls up', () => {
  assert.equal(caretScrollDelta({ caretTop: 10, caretBottom: 32, ...view }), -114);
});

test('a band too short for the margin still gives a sensible answer', () => {
  // 40px tall band: both margins cannot be met, so the caret's bottom wins
  const delta = caretScrollDelta({ caretTop: 130, caretBottom: 152, viewTop: 100, viewBottom: 140, margin: 24 });
  assert.equal(typeof delta, 'number');
  assert.ok(Number.isFinite(delta));
});
