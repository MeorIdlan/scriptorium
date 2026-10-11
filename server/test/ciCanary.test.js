import { test } from 'node:test';
import assert from 'node:assert/strict';

// Deliberately failing: proves CI goes red. Reverted right after.
test('CI canary fails on purpose', () => {
  assert.equal(1, 2);
});
