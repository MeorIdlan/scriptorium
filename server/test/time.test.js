import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS } from '../src/utils/time.js';

test('DAY_MS is one day in milliseconds', () => {
  assert.equal(DAY_MS, 86_400_000);
});
