import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSummaries } from '../src/services/summaryService.js';
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
