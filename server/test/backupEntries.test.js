import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import { workEntries } from '../src/services/backupService.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import MapModel from '../src/models/Map.js';
import Catch from '../src/models/Catch.js';
import PlotThread from '../src/models/PlotThread.js';
import Milestone from '../src/models/Milestone.js';
import Snapshot from '../src/models/Snapshot.js';

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

async function collect(entry) {
  let text = '';
  for await (const chunk of entry.chunks) text += chunk;
  return text;
}

async function gather(workId) {
  const out = {};
  for await (const entry of workEntries(workId)) {
    const text = await collect(entry);
    out[entry.path] = { kind: entry.kind, chapterId: entry.chapterId, text, count: entry.stats.count };
  }
  return out;
}

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
    scenes: [{ id: 's1', title: 'Opening' }],
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
}

test('a full work yields every entry in archive order (A1)', async () => {
  await seedFullWork();
  const entries = await gather('work_a');
  assert.deepEqual(Object.keys(entries), [
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
  ]);
  assert.equal(entries['chapters/ch1.html'].text, '<p>Hello <b>there</b></p>');
  assert.equal(entries['chapters/ch1.md'].text, 'Hello **there**\n');
  assert.equal(entries['chapters/ch1.md'].chapterId, 'ch1');
  assert.equal(entries['snapshots.json'].count, 1);
  assert.equal(entries['catches.json'].count, 1);
});

test('records use id in place of _id, and the owner is left out of work.json', async () => {
  await seedFullWork();
  const entries = await gather('work_a');
  const work = JSON.parse(entries['work.json'].text);
  assert.equal(work.id, 'work_a');
  assert.equal(work.title, 'Work A');
  assert.equal('ownerId' in work, false);
  assert.equal('_id' in work, false);
  assert.equal('__v' in JSON.parse(entries['snapshots.json'].text)[0], false);
});

test('a legacy chapter with only plain text still gets its HTML and Markdown (review focus 1)', async () => {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Legacy' });
  await Chapter.create({ _id: 'old', workId: 'work_a', title: 'Old', order: 1, content: 'Line one\n\nLine two' });
  const entries = await gather('work_a');
  assert.match(entries['chapters/old.html'].text, /Line one/);
  assert.match(entries['chapters/old.html'].text, /Line two/);
  assert.match(entries['chapters/old.md'].text, /Line one/);
  assert.match(entries['chapters/old.md'].text, /Line two/);
});

test('optional fields that are missing are exported as stored (review focus 5)', async () => {
  await Work.create({ _id: 'work_a', ownerId: 'user_a', title: 'Sparse' });
  await Chapter.create({ _id: 'ch1', workId: 'work_a', title: 'One', order: 1, contentHtml: '<p>Text</p>' });
  await Snapshot.create({
    _id: 'snap1',
    workId: 'work_a',
    chapterId: 'ch1',
    kind: 'auto',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  const entries = await gather('work_a');
  assert.deepEqual(JSON.parse(entries['scenes.json'].text), [{ chapterId: 'ch1', scenes: [] }]);
  const [snapshot] = JSON.parse(entries['snapshots.json'].text);
  assert.equal('threadIds' in snapshot, false);
  assert.equal(snapshot.chapterId, 'ch1');
});

test('a work with nothing else gives null for single documents and [] for lists (review focus 2)', async () => {
  await Work.create({ _id: 'work_empty', ownerId: 'user_a', title: 'Empty' });
  const entries = await gather('work_empty');
  assert.equal(entries['codex.json'].text, 'null');
  assert.equal(entries['codex.json'].count, 0);
  assert.equal(entries['map.json'].text, 'null');
  assert.equal(entries['chapters.json'].text, '[]');
  assert.equal(entries['snapshots.json'].count, 0);
  assert.equal(entries['work.json'].count, 1);
});

test('another work\'s records never leak into this work', async () => {
  await seedFullWork();
  await Work.create({ _id: 'work_b', ownerId: 'user_b', title: 'B' });
  await Catch.create({ _id: 'other', workId: 'work_b', content: 'Not yours' });
  const entries = await gather('work_a');
  assert.equal(entries['catches.json'].count, 1);
  assert.equal(entries['catches.json'].text.includes('Not yours'), false);
});
