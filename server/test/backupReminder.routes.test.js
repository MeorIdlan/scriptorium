import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import { DAY_MS } from '../src/utils/time.js';

const MINUTE_MS = 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();

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
});

const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const reminderPath = '/api/works/work_a/backup-reminder';

// Created 12 days ago, changed 8 days ago, never backed up: due
async function seedDueWork(fields = {}) {
  await Work.create({
    _id: 'work_a',
    ownerId: 'user_a',
    title: 'A',
    createdAt: daysAgo(12),
    updatedAt: daysAgo(8),
    lastTouched: daysAgo(8),
    contentChangedAt: daysAgo(8),
    ...fields,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('GET /api/works includes backupReminder, due for a work changed 8 days after creation with no backup', async () => {
  await seedDueWork();
  const res = await call('get', '/api/works');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].backupReminder.due, true);
  assert.equal(res.body[0].backupReminder.lastBackupAt, null);
  assert.equal(res.body[0].backupReminder.daysSinceBackup, null);
});

test('GET /api/works list items keep the index fields and omit the reminder inputs', async () => {
  await seedDueWork({ lastBackupAt: daysAgo(20), reminderState: { dismissedAt: daysAgo(1) } });
  const res = await call('get', '/api/works');
  const item = res.body[0];
  assert.deepEqual(Object.keys(item).sort(), [
    'backupReminder',
    'chapterCount',
    'coverColor',
    'createdAt',
    'currentDraft',
    'genre',
    'id',
    'lastTouched',
    'logline',
    'status',
    'title',
    'wordCount',
  ]);
  assert.equal('updatedAt' in item, false);
  assert.equal('reminderState' in item, false);
  assert.equal('contentChangedAt' in item, false);
  assert.equal('lastBackupAt' in item, false);
});

test('GET /api/works/:id includes backupReminder', async () => {
  await seedDueWork();
  const res = await call('get', '/api/works/work_a');
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'work_a');
  assert.equal(res.body.title, 'A');
  assert.equal(res.body.backupReminder.due, true);
});

test('snooze hides a due reminder and sets snoozedUntil 3 days ahead', async () => {
  await seedDueWork();
  const before = Date.now();
  const res = await call('post', reminderPath).send({ action: 'snooze' });
  assert.equal(res.status, 200);
  assert.equal(res.body.backupReminder.due, false);

  const stored = await Work.findById('work_a').lean();
  const snoozedUntil = new Date(stored.reminderState.snoozedUntil).getTime();
  const target = before + 3 * DAY_MS;
  assert.ok(Math.abs(snoozedUntil - target) <= MINUTE_MS, `snoozedUntil ${stored.reminderState.snoozedUntil}`);
});

test('dismiss hides a due reminder and sets dismissedAt; lastBackupAt is untouched', async () => {
  const lastBackupAt = daysAgo(20);
  const snoozedUntil = daysAgo(1);
  await seedDueWork({ lastBackupAt, reminderState: { snoozedUntil } });
  const before = Date.now();
  const res = await call('post', reminderPath).send({ action: 'dismiss' });
  assert.equal(res.status, 200);
  assert.equal(res.body.backupReminder.due, false);

  const stored = await Work.findById('work_a').lean();
  const dismissedAt = new Date(stored.reminderState.dismissedAt).getTime();
  assert.ok(Math.abs(dismissedAt - before) <= MINUTE_MS, `dismissedAt ${stored.reminderState.dismissedAt}`);
  assert.equal(stored.lastBackupAt, lastBackupAt);
  assert.equal(stored.reminderState.snoozedUntil, snoozedUntil);
});

test('snooze and dismiss do not stamp contentChangedAt', async () => {
  await seedDueWork({ contentChangedAt: undefined });
  const snoozed = await call('post', reminderPath).send({ action: 'snooze' });
  const dismissed = await call('post', reminderPath).send({ action: 'dismiss' });
  assert.equal(snoozed.status, 200);
  assert.equal(dismissed.status, 200);
  await sleep(50);
  const stored = await Work.findById('work_a').lean();
  assert.equal(stored.contentChangedAt, undefined);
});

test('an unknown action is a 400', async () => {
  await seedDueWork();
  const res = await call('post', reminderPath).send({ action: 'delete' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_FIELD');
});

test("another writer's work is a 404", async () => {
  await seedDueWork();
  const res = await call('post', reminderPath, 'user_b').send({ action: 'snooze' });
  assert.equal(res.status, 404);
  const stored = await Work.findById('work_a').lean();
  assert.equal(stored.reminderState, undefined);
});
