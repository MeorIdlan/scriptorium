import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { measuring, itemRecord, buildManifest, FORMAT, FORMAT_VERSION } from '../src/services/backupService.js';

test('measuring passes bytes through and reports the byte count and SHA-256', async () => {
  let seen = null;
  const stream = measuring((stats) => {
    seen = stats;
  });
  const out = [];
  stream.on('data', (chunk) => out.push(chunk));
  Readable.from([Buffer.from('a'), Buffer.from('bc')], { objectMode: false }).pipe(stream);
  await new Promise((resolve) => stream.on('end', resolve));
  assert.equal(Buffer.concat(out).toString(), 'abc');
  assert.equal(seen.bytes, 3);
  // Known SHA-256 of "abc"
  assert.equal(seen.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('itemRecord carries the entry path, kind, chapter id and count with the measured values', () => {
  const entry = { path: 'chapters/ch1.md', kind: 'chapter-markdown', chapterId: 'ch1', stats: { count: 1 } };
  assert.deepEqual(itemRecord(entry, { bytes: 9, sha256: 'abc' }), {
    path: 'chapters/ch1.md',
    kind: 'chapter-markdown',
    chapterId: 'ch1',
    count: 1,
    bytes: 9,
    sha256: 'abc',
  });
});

test('itemRecord leaves chapterId out for entries that are not per chapter', () => {
  const entry = { path: 'work.json', kind: 'work', stats: { count: 1 } };
  const record = itemRecord(entry, { bytes: 2, sha256: 'x' });
  assert.equal('chapterId' in record, false);
});

test('buildManifest names the format, the version, the work and its items (A2)', () => {
  const manifest = buildManifest({
    work: { _id: 'work_a', title: 'Work A' },
    items: [{ path: 'work.json', kind: 'work', count: 1, bytes: 2, sha256: 'x' }],
    exportedAt: '2026-10-14T12:00:00.000Z',
  });
  assert.deepEqual(manifest, {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: '2026-10-14T12:00:00.000Z',
    work: { id: 'work_a', title: 'Work A' },
    items: [{ path: 'work.json', kind: 'work', count: 1, bytes: 2, sha256: 'x' }],
  });
  assert.equal(FORMAT, 'scriptorium-work-backup');
  assert.equal(FORMAT_VERSION, 1);
});
