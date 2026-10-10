import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLimited } from '../src/utils/runLimited.js';

test('runLimited processes every item with at most `limit` running at once', async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    seen.push(n);
    running -= 1;
  });
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('runLimited rejects when a task rejects', async () => {
  await assert.rejects(
    runLimited([1, 2], 2, async (n) => {
      if (n === 2) throw new Error('boom');
    }),
    /boom/
  );
});

test('runLimited resolves for an empty list', async () => {
  await runLimited([], 3, async () => {
    throw new Error('should not run');
  });
});
