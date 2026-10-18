import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { writeAccountBackup } from '../src/services/backupService.js';
import { unzip } from './support/zip.js';

function bufferOutput() {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => out.on('end', () => resolve(Buffer.concat(chunks))));
  return { out, done };
}

function fakeEntries(texts) {
  return async function* entries() {
    for (const [path, kind, text] of texts) {
      yield { path, kind, chunks: (async function* () { yield text; })(), stats: { count: 1 } };
    }
  };
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const THREE_WORKS = [
  { _id: 'w1', title: 'One' },
  { _id: 'w2', title: 'Two' },
  { _id: 'w3', title: 'Three' },
];
const WORK_ENTRIES = fakeEntries([['work.json', 'work', '{}']]);

test('one stored inner zip per work, each a valid work backup (A1, A4)', async () => {
  const { out, done } = bufferOutput();
  await writeAccountBackup(THREE_WORKS, out, { entries: WORK_ENTRIES });
  const files = await unzip(await done, { withMeta: true });

  assert.deepEqual([...files.keys()], ['works/One-w1.zip', 'works/Two-w2.zip', 'works/Three-w3.zip', 'manifest.json']);
  for (const work of THREE_WORKS) {
    const { data, compressionMethod } = files.get(`works/${work.title}-${work._id}.zip`);
    assert.equal(compressionMethod, 0, 'the inner zip is stored, not deflated');
    const inner = await unzip(data);
    assert.deepEqual([...inner.keys()], ['work.json', 'manifest.json']);
    const manifest = JSON.parse(inner.get('manifest.json').toString());
    assert.equal(manifest.format, 'scriptorium-work-backup');
    assert.equal(manifest.work.id, work._id);
  }
});

test('account manifest lists every inner zip with its size and hash', async () => {
  const { out, done } = bufferOutput();
  await writeAccountBackup(THREE_WORKS, out, { entries: WORK_ENTRIES });
  const files = await unzip(await done);

  const manifest = JSON.parse(files.get('manifest.json').toString());
  assert.equal(manifest.format, 'scriptorium-account-backup');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(new Date(manifest.exportedAt).toISOString(), manifest.exportedAt);
  assert.equal(manifest.works.length, 3);
  manifest.works.forEach((item, i) => {
    const inner = files.get(item.path);
    assert.equal(item.path, `works/${THREE_WORKS[i].title}-${THREE_WORKS[i]._id}.zip`);
    assert.equal(item.workId, THREE_WORKS[i]._id);
    assert.equal(item.title, THREE_WORKS[i].title);
    assert.equal(item.bytes, inner.length);
    assert.equal(item.sha256, sha256(inner));
  });
  const text = JSON.stringify(manifest);
  assert.doesNotMatch(text, /ownerId|userId|email/i);
});

test('an empty account gives an archive with only the manifest', async () => {
  const { out, done } = bufferOutput();
  await writeAccountBackup([], out, { entries: WORK_ENTRIES });
  const files = await unzip(await done);
  assert.deepEqual([...files.keys()], ['manifest.json']);
  assert.deepEqual(JSON.parse(files.get('manifest.json').toString()).works, []);
});

test('a large inner entry streams without deadlock (review focus 3)', async () => {
  const chunk = Buffer.alloc(4096, 'a');
  const big = async function* entries() {
    yield {
      path: 'work.json',
      kind: 'work',
      chunks: (async function* () {
        for (let i = 0; i < 512; i++) yield chunk;
      })(),
      stats: { count: 1 },
    };
  };
  const { out, done } = bufferOutput();
  await writeAccountBackup([{ _id: 'w1', title: 'Big' }], out, { entries: big });
  const inner = await unzip((await unzip(await done)).get('works/Big-w1.zip'));
  assert.equal(inner.get('work.json').length, 2 * 1024 * 1024);
});

test('bytes reach the output before the last work is read (A3 automated)', async () => {
  const { out, done } = bufferOutput();
  const firstByte = new Promise((resolve) => out.once('data', resolve));
  async function* works() {
    yield THREE_WORKS[0];
    yield THREE_WORKS[1];
    // Only reached once bytes for works 1 and 2 are out: a write happened before the last row was read
    await firstByte;
    yield THREE_WORKS[2];
  }
  await writeAccountBackup(works(), out, { entries: WORK_ENTRIES });
  const files = await unzip(await done);
  assert.equal(files.has('works/Three-w3.zip'), true);
});

test('a failing work rejects, aborts the archive and reads no later work', async (t) => {
  const { out } = bufferOutput();
  // The outer archive is the one piped into the output; the inner per-work archive is not
  let outer = null;
  let unpipedFrom = null;
  out.on('pipe', (src) => {
    outer = src;
  });
  out.on('unpipe', (src) => {
    unpipedFrom = src;
  });
  const abort = t.mock.method(ZipArchive.prototype, 'abort');
  let pulledThree = false;
  async function* works() {
    yield THREE_WORKS[0];
    yield THREE_WORKS[1];
    pulledThree = true;
    yield THREE_WORKS[2];
  }
  const entries = async function* (workId) {
    if (workId === 'w2') throw new Error('database went away');
    yield { path: 'work.json', kind: 'work', chunks: (async function* () { yield '{}'; })(), stats: { count: 1 } };
  };
  await assert.rejects(writeAccountBackup(works(), out, { entries }), /database went away/);
  assert.equal(pulledThree, false);
  assert.notEqual(outer, null, 'the outer archive was piped into the output');
  assert.equal(outer !== null && unpipedFrom === outer, true, 'the outer archive is unpiped from the output');
  assert.equal(
    abort.mock.calls.some((call) => call.this === outer),
    true,
    'the outer archive is aborted'
  );
});

test('a client disconnect stops further works', async () => {
  const out = new PassThrough();
  out.resume();
  out.once('data', () => out.destroy());
  let pulledThree = false;
  async function* works() {
    yield THREE_WORKS[0];
    yield THREE_WORKS[1];
    pulledThree = true;
    yield THREE_WORKS[2];
  }
  await assert.rejects(writeAccountBackup(works(), out, { entries: WORK_ENTRIES }), /disconnected/);
  assert.equal(pulledThree, false);
});

test('an output destroyed before the call rejects and reads nothing', async () => {
  const out = new PassThrough();
  out.destroy();
  let pulled = false;
  async function* works() {
    pulled = true;
    yield THREE_WORKS[0];
  }
  await assert.rejects(writeAccountBackup(works(), out, { entries: WORK_ENTRIES }), /disconnected/);
  assert.equal(pulled, false);
});
