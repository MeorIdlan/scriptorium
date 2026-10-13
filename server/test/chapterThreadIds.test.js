import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import PlotThread from '../src/models/PlotThread.js';

const app = buildApp();
let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  await Work.create([
    { _id: 'work_a', ownerId: 'user_a', title: 'A' },
    { _id: 'work_b', ownerId: 'user_a', title: 'B' },
  ]);
});

test('the chapter PUT ignores threadIds', async () => {
  const ch = await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One', contentHtml: '' });
  const res = await request(app)
    .put(`/api/works/work_a/chapters/${ch.id}`)
    .set('x-test-user', 'user_a')
    .send({ title: 'X', threadIds: ['thr_1', { a: 1 }] });
  assert.equal(res.status, 200);
  const saved = await Chapter.findById(ch.id);
  assert.equal(saved.title, 'X');
  assert.deepEqual([...saved.threadIds], []);
});

const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const newThread = (id, workId = 'work_a') => PlotThread.create({ _id: id, workId, name: id, color: '#c9a96e', status: 'open', order: 0 });

test('PUT …/threads sets and clears chapter tags without touching edit times', async () => {
  await newThread('thr_a');
  await newThread('thr_b');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One', lastEditedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const set = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: ['thr_a', 'thr_b', 'thr_a'] });
  assert.equal(set.status, 200);
  assert.deepEqual(set.body.threadIds, ['thr_a', 'thr_b']);
  const saved = await Chapter.findById('ch_1').lean();
  assert.deepEqual(saved.threadIds, ['thr_a', 'thr_b']);
  assert.equal(saved.lastEditedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(saved.updatedAt, '2026-01-01T00:00:00.000Z');
  const cleared = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: [] });
  assert.deepEqual(cleared.body.threadIds, []);
});

test('PUT …/threads drops ids that are not threads of this work', async () => {
  await newThread('thr_a');
  await newThread('thr_other', 'work_b');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One' });
  const res = await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: ['thr_a', 'thr_gone', 'thr_other'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.threadIds, ['thr_a']);
});

test('PUT …/threads refuses a bad body and writes nothing', async () => {
  await newThread('thr_a');
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One', threadIds: ['thr_a'] });
  for (const body of [{}, { threadIds: 'thr_a' }, { threadIds: [1] }, { threadIds: ['bad id'] }, { threadIds: Array.from({ length: 51 }, (_, i) => `thr_${i}`) }]) {
    const res = await call('put', '/api/works/work_a/chapters/ch_1/threads').send(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(res.body.code, 'INVALID_FIELD');
  }
  assert.deepEqual((await Chapter.findById('ch_1').lean()).threadIds, ['thr_a']);
});

test("PUT …/threads 404s for a missing chapter or another writer's work", async () => {
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', title: 'One' });
  assert.equal((await call('put', '/api/works/work_a/chapters/nope/threads').send({ threadIds: [] })).status, 404);
  assert.equal((await call('put', '/api/works/work_a/chapters/ch_1/threads', 'user_b').send({ threadIds: [] })).status, 404);
});
