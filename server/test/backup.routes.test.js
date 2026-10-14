import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { startDb, clearDb } from './support/http.js';
import { unzip } from './support/zip.js';
import backupRouter from '../src/routes/backup.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import MapModel from '../src/models/Map.js';
import Catch from '../src/models/Catch.js';
import PlotThread from '../src/models/PlotThread.js';
import Milestone from '../src/models/Milestone.js';
import Snapshot from '../src/models/Snapshot.js';
import Settings from '../src/models/Settings.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: req.get('x-test-user') || 'user_a' };
  next();
});
app.use('/api/works/:workId/backup', backupRouter);
app.use(errorHandler);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const download = (workId, user = 'user_a') =>
  request(app).post(`/api/works/${workId}/backup`).set('x-test-user', user).buffer(true).parse(binary);

let stopDb;
before(async () => {
  stopDb = await startDb();
});
after(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});

async function seedFullWork() {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Work A', genre: 'Fantasy' });
  await Chapter.create({
    _id: 'ch1',
    workId: 'work_a',
    title: 'One',
    order: 1,
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    threadIds: ['t1'],
  });
  await Snapshot.create({
    _id: 'snap1',
    workId: 'work_a',
    chapterId: 'ch1',
    kind: 'named',
    name: 'Draft',
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  await Milestone.create({
    _id: 'ms1',
    workId: 'work_a',
    name: 'First',
    createdAt: '2026-10-01T00:00:00.000Z',
    chapters: [{ chapterId: 'ch1', title: 'One', order: 1, snapshotId: 'snap1', wordCount: 2 }],
  });
  await Codex.create({ _id: 'cx1', workId: 'work_a', characters: [{ name: 'Ada' }] });
  await MapModel.create({ _id: 'map1', workId: 'work_a', framework: 'three-act' });
  await Catch.create({ _id: 'c1', workId: 'work_a', content: 'An idea' });
  await PlotThread.create({ _id: 't1', workId: 'work_a', name: 'Heir', color: '#c9a96e' });
  await Settings.create({ _id: 'user_a', providers: { anthropic: { apiKey: 'sk-secret-123' } } });
}

test('the archive matches the work and every entry is listed with its hash (A1, A2, A5)', async () => {
  await seedFullWork();
  const res = await download('work_a');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/zip/);
  assert.equal(res.headers['x-accel-buffering'], 'no');
  assert.equal(res.headers['content-length'], undefined);

  const files = await unzip(res.body);
  for (const name of [
    'work.json',
    'chapters.json',
    'scenes.json',
    'chapters/ch1.html',
    'chapters/ch1.md',
    'codex.json',
    'map.json',
    'catches.json',
    'threads.json',
    'milestones.json',
    'snapshots.json',
    'manifest.json',
  ]) {
    assert.ok(files.has(name), `${name} is in the archive`);
  }

  assert.equal(JSON.parse(files.get('work.json')).title, 'Work A');
  assert.equal(files.get('chapters/ch1.html').toString(), '<p>Hello <b>there</b></p>');
  assert.equal(files.get('chapters/ch1.md').toString(), 'Hello **there**\n');
  assert.equal(JSON.parse(files.get('snapshots.json')).length, 1);

  assert.equal(JSON.parse(files.get('codex.json')).characters[0].name, 'Ada');
  const threads = JSON.parse(files.get('threads.json'));
  assert.equal(threads.find((t) => t.id === 't1').name, 'Heir');
  assert.ok(JSON.parse(files.get('catches.json')).some((c) => c.id === 'c1'));
  const chapters = JSON.parse(files.get('chapters.json'));
  assert.ok(chapters.find((c) => c.id === 'ch1').threadIds.includes('t1'));
  assert.equal(JSON.parse(files.get('map.json')).framework, 'three-act');
  assert.ok(JSON.parse(files.get('milestones.json')).some((m) => m.id === 'ms1'));
  assert.ok(JSON.parse(files.get('scenes.json')).some((s) => s.chapterId === 'ch1'));

  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.items.length, files.size - 1);
  for (const item of manifest.items) {
    const content = files.get(item.path);
    assert.equal(item.bytes, content.length, `${item.path} bytes`);
    assert.equal(item.sha256, createHash('sha256').update(content).digest('hex'), `${item.path} sha256`);
  }
});

test('another writer gets 404 for this work (A3)', async () => {
  await seedFullWork();
  const res = await download('work_a', 'user_b');
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.headers['content-type'] || '', /application\/zip/);
});

test('no AI key or provider settings appear anywhere in the archive (A3)', async () => {
  await seedFullWork();
  const res = await download('work_a');
  const files = await unzip(res.body);
  for (const [name, content] of files) {
    const text = content.toString();
    assert.equal(text.includes('sk-secret-123'), false, `${name} has no key`);
    assert.equal(text.includes('providers'), false, `${name} has no provider settings`);
  }
});

test('a failure before the first byte is a JSON error, not a zip download', async () => {
  await seedFullWork();
  const original = Work.findById;
  Work.findById = () => {
    throw new Error('boom');
  };
  let res;
  try {
    res = await download('work_a');
  } finally {
    Work.findById = original;
  }
  assert.equal(res.status, 500);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['content-disposition'], undefined);
  assert.equal(res.headers['x-accel-buffering'], undefined);
});

test('an empty work still produces a valid archive with a complete manifest (review focus 2)', async () => {
  await Work.create({ _id: 'work_empty', ownerId: 'user_a', title: 'Empty' });
  const res = await download('work_empty');
  assert.equal(res.status, 200);
  const files = await unzip(res.body);
  assert.equal(files.get('codex.json').toString(), 'null');
  assert.equal(files.get('map.json').toString(), 'null');
  assert.equal(files.get('chapters.json').toString(), '[]');
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.items.length, files.size - 1);
});

test('a title with quotes, slashes and non-Latin letters gives a safe filename (review focus 3)', async () => {
  await Work.create({ _id: 'work_odd', ownerId: 'user_a', title: 'He said "hi" / 漢字' });
  const res = await download('work_odd');
  const disposition = res.headers['content-disposition'];
  const plain = disposition.match(/filename="([^"]+)"/)[1];
  const encoded = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)[1]);
  assert.match(plain, /^[\x20-\x7e]*$/, 'plain filename is ASCII');
  assert.match(encoded, /^He-said-hi-漢字-backup-\d{4}-\d{2}-\d{2}\.zip$/);
});
