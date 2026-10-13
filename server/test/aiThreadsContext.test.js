import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { startDb, clearDb } from './support/http.js';
import aiRouter from '../src/routes/ai.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import PlotThread from '../src/models/PlotThread.js';

const saved = { NODE_ENV: process.env.NODE_ENV, LLM_PROVIDER_OVERRIDE: process.env.LLM_PROVIDER_OVERRIDE };
let stopDb;
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.LLM_PROVIDER_OVERRIDE = 'fake';
  stopDb = await startDb();
});
after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await stopDb();
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { id: 'user_a' };
  next();
});
app.use('/api/ai', aiRouter);
app.use(errorHandler);

beforeEach(async () => {
  await clearDb();
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Bells' });
  await PlotThread.create({ _id: 'thr_1', workId: 'work_a', name: 'The letter', color: '#c9a96e', description: 'Who wrote it?' });
  await PlotThread.create({ _id: 'thr_2', workId: 'work_a', name: 'The heir', color: '#7fa7d9' });
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    content: 'She walked to the well.',
    threadIds: ['thr_2'],
    scenes: [{ id: 's1', title: 'Well', threadIds: ['thr_1'] }],
  });
});

const post = (path, body) => request(app).post(`/api/ai/${path}`).send({ workId: 'work_a', ...body });

test('hooks send the open scene’s threads', async () => {
  const res = await post('hooks', { chapterId: 'ch1', sceneId: 's1', content: 'She walked to the well.' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.context.threads, ['The letter']);
});

test('the Rekindler sends the chapter’s threads (no open scene)', async () => {
  const res = await post('rekindler', {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.context.threads, ['The heir']);
});

test('editor review sends the chapter’s threads when no scene is open', async () => {
  const res = await post('editor-review', { chapterId: 'ch1', content: 'She walked to the well.', mode: 'full' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.context.threads, ['The heir']);
});

test('pacing does not ask for threads', async () => {
  const res = await post('pacing', { chapterId: 'ch1', content: 'She walked to the well.' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.context.threads, []);
});
