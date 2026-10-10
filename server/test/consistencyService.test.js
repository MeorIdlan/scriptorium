import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleConflicts } from '../src/services/consistencyService.js';

test('titleConflicts flags title + name pairs that are not aliases', () => {
  assert.deepEqual(titleConflicts({ name: 'Mara' }, 'Lady Mara met Mara Captain.'), ['Lady', 'Captain']);
});

test('titleConflicts accepts aliases saved as a comma-separated string', () => {
  const character = { name: 'Mara', aliases: 'Lady Mara, The Grey' };
  assert.deepEqual(titleConflicts(character, 'Lady Mara met Captain Mara.'), ['Captain']);
});

test('titleConflicts accepts aliases saved as an array', () => {
  const character = { name: 'Mara', aliases: ['lady mara'] };
  assert.deepEqual(titleConflicts(character, 'Lady Mara waited.'), []);
});

test('titleConflicts ignores characters without a name or not in the text', () => {
  assert.deepEqual(titleConflicts({ name: '' }, 'Lady Mara'), []);
  assert.deepEqual(titleConflicts({ name: 'Tomas' }, 'Lady Mara'), []);
});
