import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { PassThrough } from 'node:stream';
import { startDb, clearDb } from './support/http.js';
import { cutShortDownload } from './support/cutShort.js';
import { unzip } from './support/zip.js';
import accountBackupRouter, { ownedWorks } from '../src/routes/accountBackup.js';
import { writeWorkBackup, accountEntryPath } from '../src/services/backupService.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import Snapshot from '../src/models/Snapshot.js';
import Settings from '../src/models/Settings.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: req.get('x-test-user') || 'user_a' };
  next();
});
app.use('/api/backup', accountBackupRouter);
app.use(errorHandler);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const download = (user = 'user_a') =>
  request(app).post('/api/backup').set('x-test-user', user).buffer(true).parse(binary);

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

async function seedWork({ id, owner = 'user_a', title, createdAt }) {
  await Work.create({ _id: id, ownerId: owner, title, createdAt });
  await Chapter.create({
    _id: `${id}_ch1`,
    workId: id,
    title: 'One',
    order: 1,
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
  });
  await Codex.create({ _id: `${id}_cx`, workId: id, characters: [{ name: 'Ada' }] });
  await Snapshot.create({
    _id: `${id}_snap`,
    workId: id,
    chapterId: `${id}_ch1`,
    kind: 'named',
    name: 'Draft',
    content: 'Hello there',
    contentHtml: '<p>Hello <b>there</b></p>',
    createdAt,
  });
}

// user_a owns three works (created out of order); user_b owns one
async function seedAccount() {
  await seedWork({ id: 'work_a3', title: 'Third', createdAt: '2026-10-03T00:00:00.000Z' });
  await seedWork({ id: 'work_a1', title: 'First', createdAt: '2026-10-01T00:00:00.000Z' });
  await seedWork({ id: 'work_a2', title: 'Second', createdAt: '2026-10-02T00:00:00.000Z' });
  await seedWork({ id: 'work_b1', owner: 'user_b', title: 'Not mine', createdAt: '2026-10-01T12:00:00.000Z' });
}

const USER_A_IN_ORDER = ['work_a1', 'work_a2', 'work_a3'];

test('one inner zip per owned work and none of another writer\'s (A1, A2, A4)', async () => {
  await seedAccount();
  const res = await download();
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/zip/);
  assert.equal(res.headers['x-accel-buffering'], 'no');
  assert.equal(res.headers['content-length'], undefined);

  const files = await unzip(res.body);
  const innerNames = [...files.keys()].filter((name) => name.startsWith('works/'));
  const expected = [];
  for (const id of USER_A_IN_ORDER) expected.push(accountEntryPath(await Work.findById(id).lean()));
  assert.equal(innerNames.length, 3);
  assert.deepEqual(innerNames, expected);

  assert.equal([...files.keys()].some((name) => name.includes('work_b1')), false);
  const manifest = JSON.parse(files.get('manifest.json').toString());
  assert.deepEqual(
    manifest.works.map((item) => item.path),
    expected
  );
  assert.equal(JSON.stringify(manifest).includes('work_b1'), false);
});

test('each inner zip matches a standalone backup of that work (A1)', async () => {
  await seedAccount();
  const files = await unzip((await download()).body);

  for (const id of USER_A_IN_ORDER) {
    const work = await Work.findById(id).lean();
    const out = new PassThrough();
    const chunks = [];
    out.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => out.on('end', () => resolve(Buffer.concat(chunks))));
    await writeWorkBackup(work, out);
    const standalone = await unzip(await done);

    const inner = await unzip(files.get(accountEntryPath(work)));
    assert.deepEqual([...inner.keys()], [...standalone.keys()]);
    for (const [name, content] of standalone) {
      if (name === 'manifest.json') continue;
      assert.deepEqual(inner.get(name), content, `${id} ${name}`);
    }
    const innerManifest = JSON.parse(inner.get('manifest.json').toString());
    const standaloneManifest = JSON.parse(standalone.get('manifest.json').toString());
    assert.deepEqual(innerManifest.items, standaloneManifest.items);
  }
});

test('the download is named scriptorium-backup-<UTC date>.zip', async () => {
  await seedAccount();
  const res = await download();
  assert.match(res.headers['content-disposition'], /filename="scriptorium-backup-\d{4}-\d{2}-\d{2}\.zip"/);
});

test('a writer with no works gets a manifest-only archive', async () => {
  const res = await download('user_c');
  assert.equal(res.status, 200);
  const files = await unzip(res.body);
  assert.deepEqual([...files.keys()], ['manifest.json']);
  assert.deepEqual(JSON.parse(files.get('manifest.json').toString()).works, []);
});

test('no AI key or provider settings appear in the archive', async () => {
  await seedAccount();
  await Settings.create({ _id: 'user_a', providers: { anthropic: { apiKey: 'sk-test-SECRET' } } });
  const res = await download();
  assert.equal(res.body.includes('sk-test-SECRET'), false);
  assert.equal(res.body.includes('apiKey'), false);

  const files = await unzip(res.body);
  for (const [name, content] of files) {
    const inner = name.startsWith('works/') ? await unzip(content) : new Map([[name, content]]);
    for (const [innerName, text] of inner) {
      assert.equal(text.toString().includes('sk-test-SECRET'), false, `${innerName} has no key`);
      assert.equal(text.toString().includes('apiKey'), false, `${innerName} has no apiKey`);
    }
  }
});

test('a form POST gets the same archive', async () => {
  await seedAccount();
  const res = await request(app)
    .post('/api/backup')
    .set('x-test-user', 'user_a')
    .type('form')
    .send('')
    .buffer(true)
    .parse(binary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/zip/);
  const files = await unzip(res.body);
  assert.equal([...files.keys()].filter((name) => name.startsWith('works/')).length, 3);
});

test('two works with the same title get distinct entries (review focus 2)', async () => {
  await seedWork({ id: 'work_d1', title: 'Draft', createdAt: '2026-10-01T00:00:00.000Z' });
  await seedWork({ id: 'work_d2', title: 'Draft', createdAt: '2026-10-02T00:00:00.000Z' });
  const files = await unzip((await download()).body);
  assert.ok(files.has('works/Draft-work_d1.zip'));
  assert.ok(files.has('works/Draft-work_d2.zip'));
});

test('odd titles give flat, safe entry names (review focus 4)', async () => {
  await seedWork({ id: 'work_q1', title: 'a/b "c"', createdAt: '2026-10-01T00:00:00.000Z' });
  await seedWork({ id: 'work_q2', title: '日本語', createdAt: '2026-10-02T00:00:00.000Z' });
  const files = await unzip((await download()).body);
  const innerNames = [...files.keys()].filter((name) => name.startsWith('works/'));
  assert.equal(innerNames.length, 2);
  for (const name of innerNames) assert.match(name, /^works\/[^/]+\.zip$/);
});

test('a work deleted after the list is read is skipped (review focus 1)', async () => {
  await seedWork({ id: 'work_a', title: 'Alpha', createdAt: '2026-10-01T00:00:00.000Z' });
  await seedWork({ id: 'work_b', title: 'Beta', createdAt: '2026-10-02T00:00:00.000Z' });
  await seedWork({ id: 'work_c', title: 'Gamma', createdAt: '2026-10-03T00:00:00.000Z' });

  const works = ownedWorks('user_a');
  const first = await works.next();
  await Work.deleteOne({ _id: 'work_b' });
  const rest = [];
  for await (const work of works) rest.push(work._id);

  assert.deepEqual([first.value._id, ...rest], ['work_a', 'work_c']);
});

test('a failure before the first byte is a JSON error, not a zip download', async () => {
  await seedAccount();
  const original = Work.find;
  Work.find = () => {
    throw new Error('boom');
  };
  let res;
  try {
    res = await download();
  } finally {
    Work.find = original;
  }
  assert.equal(res.status, 500);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['content-disposition'], undefined);
  assert.equal(res.headers['x-accel-buffering'], undefined);
});

test('a finished account backup stamps every included work, not other writers\' works', async () => {
  await seedAccount();
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T10:00:00.000Z') });
  try {
    const res = await download();
    assert.equal(res.status, 200);
  } finally {
    mock.timers.reset();
  }

  const lastBackups = Object.fromEntries((await Work.find().lean()).map((w) => [w._id, w.lastBackupAt ?? null]));
  assert.deepEqual(lastBackups, {
    work_a1: '2026-10-19T10:00:00.000Z',
    work_a2: '2026-10-19T10:00:00.000Z',
    work_a3: '2026-10-19T10:00:00.000Z',
    work_b1: null,
  });
});

test('an account backup cut short after its first work stamps nothing', async () => {
  await seedAccount();
  // The second work's snapshots fail, so the first work's stream has finished but the backup has not
  const result = await cutShortDownload(app, '/api/backup', 'user_a', { failingCall: 2 });
  assert.equal(result.complete, false);

  const stamped = await Work.countDocuments({ lastBackupAt: { $exists: true } });
  assert.equal(stamped, 0);
});
