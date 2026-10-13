import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import { buildContext } from '../src/services/storyContextService.js';
import Chapter from '../src/models/Chapter.js';
import PlotThread from '../src/models/PlotThread.js';

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});

const work = { _id: 'work_a', title: 'Bells' };
const thread = (id, name, extra = {}) => ({ _id: id, workId: 'work_a', name, color: '#c9a96e', ...extra });

beforeEach(async () => {
  await clearDb();
  await PlotThread.create([
    thread('thr_1', 'The letter', { description: 'Who wrote it?' }),
    thread('thr_2', 'The feud', { description: 'Old grudge', status: 'resolved' }),
    thread('thr_3', 'The heir'),
  ]);
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    threadIds: ['thr_3', 'thr_2'],
    scenes: [
      { id: 's1', title: 'Well', threadIds: ['thr_1', 'thr_gone', 'thr_2'] },
      { id: 's2', title: 'Road', threadIds: [] },
    ],
  });
});

const ctx = (extra = {}) =>
  buildContext({ work, chapterId: 'ch1', sceneId: 's1', needs: { threads: true }, ...extra });

test('the open scene’s threads go in with name, status and description, in tag order', async () => {
  const { text, manifest } = await ctx();
  assert.ok(text.includes('## Plot threads in play\n- The letter (open): Who wrote it?\n- The feud (resolved): Old grudge'));
  assert.ok(!text.includes('The heir'));
  assert.deepEqual(manifest.threads, ['The letter', 'The feud']);
});

test('a scene with no tags falls back to the chapter’s tags', async () => {
  const { text, manifest } = await ctx({ sceneId: 's2' });
  assert.ok(text.includes('- The heir (open)\n- The feud (resolved): Old grudge'));
  assert.deepEqual(manifest.threads, ['The heir', 'The feud']);
});

test('no open scene uses the chapter’s tags', async () => {
  const { manifest } = await ctx({ sceneId: undefined });
  assert.deepEqual(manifest.threads, ['The heir', 'The feud']);
});

test('a chapter with no tags and no tagged scene adds no threads', async () => {
  await Chapter.updateOne({ _id: 'ch1' }, { threadIds: [] });
  const { text, manifest } = await ctx({ sceneId: 's2', needs: { threads: true, story: true } });
  assert.ok(!text.includes('Plot threads'));
  assert.deepEqual(manifest.threads, []);
});

test('ids of deleted threads are ignored', async () => {
  await PlotThread.deleteOne({ _id: 'thr_1' });
  const { manifest } = await ctx();
  assert.deepEqual(manifest.threads, ['The feud']);
});

test('threads are left out unless asked for', async () => {
  const out = await ctx({ needs: { story: true } });
  assert.ok(!out.text.includes('Plot threads'));
  assert.deepEqual(out.manifest.threads, []);
});

test('threads from another work never appear', async () => {
  await PlotThread.create(thread('thr_x', 'Elsewhere', { workId: 'work_b' }));
  await Chapter.updateOne({ _id: 'ch1' }, { threadIds: ['thr_x'] });
  const { manifest } = await ctx({ sceneId: 's2', needs: { threads: true, story: true } });
  assert.deepEqual(manifest.threads, []);
});

test('a failing thread lookup does not fail the AI call', async () => {
  const find = PlotThread.find;
  PlotThread.find = () => {
    throw new Error('db down');
  };
  const errors = console.error;
  console.error = () => {};
  try {
    const { text, manifest } = await ctx({ needs: { threads: true, story: true } });
    assert.ok(text.includes('## Story'));
    assert.deepEqual(manifest.threads, []);
  } finally {
    PlotThread.find = find;
    console.error = errors;
  }
});
