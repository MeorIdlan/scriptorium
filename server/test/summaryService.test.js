import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSummaries, summarySaveFilter } from '../src/services/summaryService.js';
import { hashContent } from '../src/services/summaryText.js';

const work = { _id: 'work_1', ownerId: 'user_1', title: 'Bells' };
const ch = (id, content, summary) => ({ _id: id, number: 1, title: id, content, summary });

test('ensureSummaries reuses fresh and edited summaries, generates the rest, skips empty chapters', async () => {
  const generated = [];
  const chapters = [
    ch('c1', 'one', { text: 'fresh', sourceHash: hashContent('one') }),
    ch('c2', 'two', { text: 'mine', sourceHash: 'old', edited: true }),
    ch('c3', 'three', { text: 'stale', sourceHash: 'old' }),
    ch('c4', 'four'),
    ch('c5', '   '),
  ];
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    generate: async (_w, c) => {
      generated.push(c._id);
      return `new ${c._id}`;
    },
  });
  assert.deepEqual(generated.sort(), ['c3', 'c4']);
  assert.equal(summaries.get('c1'), 'fresh');
  assert.equal(summaries.get('c2'), 'mine');
  assert.equal(summaries.get('c3'), 'new c3');
  assert.equal(summaries.get('c4'), 'new c4');
  assert.equal(summaries.has('c5'), false);
  assert.equal(unavailable, 0);
});

test('ensureSummaries counts failures as unavailable and keeps going', async () => {
  const chapters = [ch('c1', 'one'), ch('c2', 'two')];
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    generate: async (_w, c) => {
      if (c._id === 'c1') {
        const err = new Error('Summary was empty');
        err.code = 'EMPTY_SUMMARY';
        throw err;
      }
      return 'ok';
    },
  });
  assert.equal(unavailable, 1);
  assert.equal(summaries.has('c1'), false);
  assert.equal(summaries.get('c2'), 'ok');
});

test('ensureSummaries rethrows NO_API_KEY instead of counting it', async () => {
  await assert.rejects(
    ensureSummaries(work, [ch('c1', 'one')], {
      generate: async () => {
        const err = new Error('No API key configured for active provider');
        err.code = 'NO_API_KEY';
        throw err;
      },
    }),
    (err) => err.code === 'NO_API_KEY'
  );
});

const providerError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test('ensureSummaries fails fast on provider auth errors', async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0;
    await assert.rejects(
      ensureSummaries(work, [ch('c1', 'one'), ch('c2', 'two'), ch('c3', 'three'), ch('c4', 'four')], {
        generate: async () => {
          calls += 1;
          throw providerError(status);
        },
      }),
      (err) => err.status === status
    );
    assert.ok(calls <= 3, `status ${status}: ${calls} calls`);
  }
});

test('ensureSummaries stops starting summaries after a rate limit', async () => {
  let calls = 0;
  const chapters = Array.from({ length: 9 }, (_, i) => ch(`c${i}`, `text ${i}`));
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    generate: async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      throw providerError(429);
    },
  });
  assert.ok(calls <= 3, `${calls} calls`);
  assert.equal(unavailable, 9);
  assert.equal(summaries.size, 0);
});

test('ensureSummaries stops starting summaries once its time budget is spent', async () => {
  let clock = 0;
  let calls = 0;
  const chapters = Array.from({ length: 10 }, (_, i) => ch(`c${i}`, `text ${i}`));
  const { summaries, unavailable } = await ensureSummaries(work, chapters, {
    budgetMs: 100,
    now: () => clock,
    generate: async (_w, c) => {
      calls += 1;
      clock += 40; // each summary "takes" 40ms of budget
      return `s ${c._id}`;
    },
  });
  assert.ok(calls < 10, `${calls} calls`);
  assert.equal(summaries.size + unavailable, 10);
  assert.ok(unavailable > 0);
});

test('summarySaveFilter protects edited summaries unless regenerating on purpose', () => {
  const chapter = { _id: 'c1', content: 'one' };
  assert.deepEqual(summarySaveFilter(chapter), { _id: 'c1', content: 'one', 'summary.edited': { $ne: true } });
  assert.deepEqual(summarySaveFilter(chapter, { force: true }), { _id: 'c1', content: 'one' });
});
