import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { writeWorkBackup, jsonArray } from '../src/services/backupService.js';
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

test('the archive holds each entry and a manifest that describes it (A2)', async () => {
  const { out, done } = bufferOutput();
  const work = { _id: 'work_a', title: 'Work A' };
  await writeWorkBackup(work, out, {
    entries: fakeEntries([
      ['work.json', 'work', '{"title":"Work A"}'],
      ['chapters/ch1.md', 'chapter-markdown', 'Hello\n'],
    ]),
  });
  const files = await unzip(await done);
  assert.deepEqual([...files.keys()], ['work.json', 'chapters/ch1.md', 'manifest.json']);

  const manifest = JSON.parse(files.get('manifest.json').toString());
  assert.equal(manifest.format, 'scriptorium-work-backup');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.work.id, 'work_a');
  assert.equal(manifest.items.length, 2);
  for (const item of manifest.items) {
    const content = files.get(item.path);
    assert.equal(item.bytes, content.length);
    assert.equal(item.sha256, createHash('sha256').update(content).digest('hex'));
    assert.equal(item.count, 1);
  }
  assert.equal(manifest.items.some((i) => i.path === 'manifest.json'), false);
});

test('jsonArray writes a valid JSON array, one record at a time', async () => {
  const stats = { count: 0 };
  async function* rows() {
    yield { id: 'a' };
    yield { id: 'b' };
  }
  let text = '';
  for await (const chunk of jsonArray(rows(), stats)) text += chunk;
  assert.deepEqual(JSON.parse(text), [{ id: 'a' }, { id: 'b' }]);
  assert.equal(stats.count, 2);
});
