import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import exportRouter from '../src/routes/export.js';
import sessionsRouter from '../src/routes/sessions.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Milestone from '../src/models/Milestone.js';

const app = buildApp();
let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
afterEach(() => {
  mock.restoreAll();
});
beforeEach(async () => {
  await clearDb();
  await Work.create({
    _id: 'work_a',
    ownerId: 'user_a',
    title: 'A',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The stamp runs after 'finish', so poll for it rather than trusting a fixed delay
async function stampedAt(workId = 'work_a') {
  for (let i = 0; i < 20; i++) {
    const work = await Work.findById(workId).lean();
    if (work.contentChangedAt) return work.contentChangedAt;
    await sleep(10);
  }
  return undefined;
}

// A stamp that never comes can't be polled for, so give the finish handler a moment first
async function assertNotStamped(workId = 'work_a') {
  await sleep(50);
  const work = await Work.findById(workId).lean();
  assert.equal(work.contentChangedAt, undefined);
}

async function until(check) {
  for (let i = 0; i < 20 && !check(); i++) await sleep(10);
}

const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const chapterBase = '/api/works/work_a/chapters';

async function seedChapter() {
  const now = '2026-01-01T00:00:00.000Z';
  await Chapter.create({
    _id: 'ch_1',
    workId: 'work_a',
    number: 1,
    title: 'One',
    order: 0,
    content: '<p>Old</p>',
    wordCount: 1,
    status: 'draft',
    createdAt: now,
    lastEditedAt: now,
    updatedAt: now,
  });
}

test('creating a chapter stamps contentChangedAt', async () => {
  const res = await call('post', chapterBase).send({ title: 'Two' });
  assert.equal(res.status, 201);
  assert.ok(await stampedAt());
});

test('saving a chapter stamps contentChangedAt', async () => {
  await seedChapter();
  const res = await call('put', `${chapterBase}/ch_1`).send({ content: '<p>New</p>' });
  assert.equal(res.status, 200);
  assert.ok(await stampedAt());
});

test('adding a codex character stamps contentChangedAt', async () => {
  const res = await call('post', '/api/works/work_a/codex/characters').send({ name: 'Ada' });
  assert.equal(res.status, 201);
  assert.ok(await stampedAt());
});

test('adding a catch stamps contentChangedAt', async () => {
  const res = await call('post', '/api/works/work_a/catches').send({ content: 'A stray idea' });
  assert.equal(res.status, 201);
  assert.ok(await stampedAt());
});

test('adding a thread stamps contentChangedAt', async () => {
  const res = await call('post', '/api/works/work_a/threads').send({ name: 'The missing heir' });
  assert.equal(res.status, 201);
  assert.ok(await stampedAt());
});

test('saving the map stamps contentChangedAt', async () => {
  const res = await call('put', '/api/works/work_a/map').send({ framework: 'three-act' });
  assert.equal(res.status, 200);
  assert.ok(await stampedAt());
});

test('renaming a milestone stamps contentChangedAt', async () => {
  await Milestone.create({
    _id: 'ms_1',
    workId: 'work_a',
    name: 'Draft one',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const res = await call('patch', '/api/works/work_a/milestones/ms_1').send({ name: 'Draft two' });
  assert.equal(res.status, 200);
  assert.ok(await stampedAt());
});

test('PUT /api/works/:id stamps contentChangedAt and ignores lastBackupAt, contentChangedAt, reminderState and backupReminder in the body', async () => {
  const bogus = '2000-01-01T00:00:00.000Z';
  await Work.updateOne(
    { _id: 'work_a' },
    { $set: { lastBackupAt: '2026-01-05T00:00:00.000Z', reminderState: { dismissedAt: '2026-01-06T00:00:00.000Z' } } }
  );

  const res = await call('put', '/api/works/work_a').send({
    title: 'Renamed',
    lastBackupAt: bogus,
    contentChangedAt: bogus,
    reminderState: { snoozedUntil: bogus },
    backupReminder: { due: true },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Renamed');

  const stamped = await stampedAt();
  assert.ok(stamped);
  assert.notEqual(stamped, bogus);
  const work = await Work.findById('work_a').lean();
  assert.equal(work.lastBackupAt, '2026-01-05T00:00:00.000Z');
  assert.deepEqual(work.reminderState, { dismissedAt: '2026-01-06T00:00:00.000Z' });
});

test('PUT /api/works/:id cannot set server-owned fields through dotted keys or $ operators', async () => {
  const bogus = '2000-01-01T00:00:00.000Z';
  await Work.updateOne(
    { _id: 'work_a' },
    { $set: { lastBackupAt: '2026-01-05T00:00:00.000Z', reminderState: { dismissedAt: '2026-01-06T00:00:00.000Z' } } }
  );

  const dotted = await call('put', '/api/works/work_a').send({
    title: 'Dotted',
    'reminderState.snoozedUntil': 'HACK',
  });
  assert.equal(dotted.status, 200);
  const operator = await call('put', '/api/works/work_a').send({
    title: 'Operator',
    $set: { lastBackupAt: 'HACK2', contentChangedAt: bogus },
  });
  assert.equal(operator.status, 200);
  const nested = await call('put', '/api/works/work_a').send({
    $set: { 'reminderState.snoozedUntil': 'HACK3' },
  });
  assert.equal(nested.status, 200);

  const stamped = await stampedAt();
  assert.ok(stamped);
  assert.notEqual(stamped, bogus);
  const work = await Work.findById('work_a').lean();
  assert.equal(work.title, 'Operator');
  assert.equal(work.lastBackupAt, '2026-01-05T00:00:00.000Z');
  assert.deepEqual(work.reminderState, { dismissedAt: '2026-01-06T00:00:00.000Z' });
});

test("GET requests don't stamp", async () => {
  await seedChapter();
  assert.equal((await call('get', chapterBase)).status, 200);
  assert.equal((await call('get', `${chapterBase}/ch_1`)).status, 200);
  await assertNotStamped();
});

test("a failed write doesn't stamp", async () => {
  const res = await call('post', '/api/works/work_a/threads').send({});
  assert.equal(res.status, 400);
  await assertNotStamped();
});

test("another writer's request doesn't stamp", async () => {
  await seedChapter();
  const res = await call('put', `${chapterBase}/ch_1`, 'user_b').send({ content: '<p>Theft</p>' });
  assert.equal(res.status, 404);
  await assertNotStamped();
});

test("a stamp that fails doesn't fail the request", async () => {
  await seedChapter();
  const realUpdateOne = Work.updateOne;
  mock.method(Work, 'updateOne', function (filter, update, ...rest) {
    if (update?.$set?.contentChangedAt) throw new Error('boom');
    return realUpdateOne.call(Work, filter, update, ...rest);
  });
  const logged = mock.method(console, 'error', () => {});

  const res = await call('put', `${chapterBase}/ch_1`).send({ content: '<p>Saved</p>' });
  assert.equal(res.status, 200);
  await until(() => logged.mock.callCount() > 0);
  assert.equal(logged.mock.callCount(), 1);

  const chapter = await Chapter.findById('ch_1').lean();
  assert.equal(chapter.content, '<p>Saved</p>');
});

test("POST /api/works with an opening hook sets contentChangedAt; without one it doesn't", async () => {
  const hooked = await call('post', '/api/works').send({ title: 'Hooked', openingHook: 'It began at dawn.' });
  assert.equal(hooked.status, 201);
  assert.match(hooked.body.contentChangedAt, /^\d{4}-\d{2}-\d{2}T/);
  const hookedRow = await Work.findById(hooked.body.id).lean();
  assert.equal(hookedRow.contentChangedAt, hooked.body.contentChangedAt);

  const plain = await call('post', '/api/works').send({ title: 'Plain' });
  assert.equal(plain.status, 201);
  assert.equal(plain.body.contentChangedAt, undefined);
  const plainRow = await Work.findById(plain.body.id).lean();
  assert.equal(plainRow.contentChangedAt, undefined);
});

test("an export request and a writing session don't stamp", async () => {
  const writes = express();
  writes.use(express.json());
  writes.use((req, _res, next) => {
    req.user = { id: req.get('x-test-user') || 'user_a' };
    next();
  });
  writes.use('/api/works/:workId/export', exportRouter);
  writes.use('/api/works/:workId/sessions', sessionsRouter);
  writes.use(errorHandler);

  const exported = await request(writes)
    .post('/api/works/work_a/export')
    .set('x-test-user', 'user_a')
    .send({ format: 'pdf', layout: 'manuscript', manuscript: { workOnly: true, authorName: 'Ada', surname: 'Lovelace' } });
  assert.equal(exported.status, 200);
  const saved = await Work.findById('work_a').lean();
  assert.equal(saved.manuscript.override.authorName, 'Ada');

  const session = await request(writes)
    .post('/api/works/work_a/sessions')
    .set('x-test-user', 'user_a')
    .send({ chapterId: null, wordsAtStart: 0 });
  assert.equal(session.status, 201);

  await assertNotStamped();
});
