import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';

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
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'A' });
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
