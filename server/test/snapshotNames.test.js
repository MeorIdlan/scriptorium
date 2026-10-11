import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateName, MAX_NAME_LENGTH } from '../src/services/snapshotNames.js';

test('validateName trims and returns the name', () => {
  assert.equal(validateName('  Draft 1  '), 'Draft 1');
});

test('validateName rejects missing or blank names', () => {
  for (const bad of [undefined, null, '', '   ', 42]) {
    assert.throws(() => validateName(bad), (err) => err.status === 400 && err.code === 'MISSING_FIELD');
  }
});

test('validateName allows 80 characters and rejects 81', () => {
  assert.equal(MAX_NAME_LENGTH, 80);
  assert.equal(validateName('x'.repeat(80)).length, 80);
  assert.throws(() => validateName('x'.repeat(81)), (err) => err.status === 400 && err.code === 'TOO_LONG');
});
