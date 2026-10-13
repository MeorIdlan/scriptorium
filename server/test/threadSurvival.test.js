import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import PlotThread from '../src/models/PlotThread.js';
import Snapshot from '../src/models/Snapshot.js';
import Milestone from '../src/models/Milestone.js';
import { sceneSummaries } from '../src/services/sceneMarkers.js';

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

const call = (method, path) => request(app)[method](path).set('x-test-user', 'user_a');
const thread = (id) => PlotThread.create({ _id: id, workId: 'work_a', name: id, color: '#c9a96e', status: 'open', order: 0 });
const hr = (id, threads) => `<hr data-scene="${id}"${threads ? ` data-threads="${threads}"` : ''} data-status="draft" />`;
const chapter = (_id, contentHtml, threadIds = [], extra = {}) =>
  Chapter.create({ _id, workId: 'work_a', title: _id, contentHtml, content: 'text', threadIds, scenes: sceneSummaries(contentHtml), ...extra });

test('saving keeps scene tags that are threads and drops strays; reload shows them', async () => {
  await thread('thr_a');
  await chapter('ch_1', '');
  const html = `${hr('scn_1', 'thr_a thr_gone')}<div>One.</div>`;
  const res = await call('put', '/api/works/work_a/chapters/ch_1').send({ content: 'One.', contentHtml: html });
  assert.equal(res.status, 200);
  const reloaded = (await call('get', '/api/works/work_a/chapters/ch_1')).body;
  assert.match(reloaded.contentHtml, /data-threads="thr_a"/);
  assert.doesNotMatch(reloaded.contentHtml, /thr_gone/);
  assert.deepEqual(reloaded.scenes.map((s) => s.threadIds), [['thr_a']]);
});

test('a scene keeps its tags when it moves to another chapter and within a chapter', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a')}<div>One.</div>${hr('scn_2', 'thr_a thr_b')}<div>Two.</div>`);
  await chapter('ch_2', `${hr('scn_3', 'thr_b')}<div>Three.</div>`);

  const across = await call('post', '/api/works/work_a/chapters/ch_1/scenes/move').send({ sceneId: 'scn_2', toChapterId: 'ch_2', toIndex: 0 });
  assert.equal(across.status, 200);
  const dst = await Chapter.findById('ch_2').lean();
  assert.deepEqual(dst.scenes.map((s) => [s.id, s.threadIds]), [['scn_2', ['thr_a', 'thr_b']], ['scn_3', ['thr_b']]]);
  const src = await Chapter.findById('ch_1').lean();
  assert.deepEqual(src.scenes.map((s) => [s.id, s.threadIds]), [['scn_1', ['thr_a']]]);

  const within = await call('post', '/api/works/work_a/chapters/ch_2/scenes/move').send({ sceneId: 'scn_3', toChapterId: 'ch_2', toIndex: 0 });
  assert.equal(within.status, 200);
  assert.deepEqual((await Chapter.findById('ch_2').lean()).scenes.map((s) => [s.id, s.threadIds]), [['scn_3', ['thr_b']], ['scn_2', ['thr_a', 'thr_b']]]);
});

test('a move drops tags of a thread deleted since the scene was saved', async () => {
  await thread('thr_a');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_gone')}<div>One.</div>${hr('scn_2')}<div>Two.</div>`);
  await chapter('ch_2', '<div>Other.</div>');
  await call('post', '/api/works/work_a/chapters/ch_1/scenes/move').send({ sceneId: 'scn_1', toChapterId: 'ch_2', toIndex: 0 });
  const dst = await Chapter.findById('ch_2').lean();
  assert.doesNotMatch(dst.contentHtml, /thr_gone/);
  assert.deepEqual(dst.scenes[0].threadIds, ['thr_a']);
});

const snapshot = async (chapterId, name = 'Keep') =>
  (await call('post', `/api/works/work_a/chapters/${chapterId}/snapshots`).send({ name })).body.id;
const restore = (chapterId, snapId) => call('post', `/api/works/work_a/chapters/${chapterId}/snapshots/${snapId}/restore`);

test('restoring a snapshot brings back chapter and scene tags', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const snapId = await snapshot('ch_1');
  await call('put', '/api/works/work_a/chapters/ch_1/threads').send({ threadIds: [] });
  await call('put', '/api/works/work_a/chapters/ch_1').send({ content: 'Changed.', contentHtml: `${hr('scn_1')}<div>Changed.</div>` });

  const res = await restore('ch_1', snapId);
  assert.equal(res.status, 200);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_a', 'thr_b']);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_a']]);
  assert.match(ch.contentHtml, /data-threads="thr_a"/);
});

test('restoring never brings back a deleted thread', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_b')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const snapId = await snapshot('ch_1');
  await call('delete', '/api/works/work_a/threads/thr_a');
  await restore('ch_1', snapId);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_b']);
  assert.doesNotMatch(ch.contentHtml, /thr_a/);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_b']]);
});

test('restoring a snapshot from before chapter tags existed leaves the chapter tags alone', async () => {
  await thread('thr_a');
  await chapter('ch_1', '<div>Now.</div>', ['thr_a']);
  await Snapshot.collection.insertOne({
    _id: 'snap_old', workId: 'work_a', chapterId: 'ch_1', kind: 'auto', content: 'Old.', contentHtml: '<div>Old.</div>', wordCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
  });
  const res = await restore('ch_1', 'snap_old');
  assert.equal(res.status, 200);
  const ch = await Chapter.findById('ch_1').lean();
  assert.equal(ch.content, 'Old.');
  assert.deepEqual(ch.threadIds, ['thr_a']);
});

test('bringing a deleted chapter back from a milestone restores its tags, minus deleted threads', async () => {
  await thread('thr_a');
  await thread('thr_b');
  await chapter('ch_1', `${hr('scn_1', 'thr_a thr_b')}<div>One.</div>`, ['thr_a', 'thr_b']);
  const ms = (await call('post', '/api/works/work_a/milestones').send({ name: 'First draft' })).body.id;
  await call('delete', '/api/works/work_a/chapters/ch_1');
  await call('delete', '/api/works/work_a/threads/thr_b');

  const res = await call('post', `/api/works/work_a/milestones/${ms}/chapters/ch_1/restore`);
  assert.equal(res.status, 201);
  assert.equal(res.body.recreated, true);
  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, ['thr_a']);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [['thr_a']]);
});

test('a chapter recreated from a milestone without chapter tags comes back untagged', async () => {
  await thread('thr_a');
  await Snapshot.collection.insertOne({
    _id: 'snap_old', workId: 'work_a', chapterId: 'ch_9', kind: 'milestone', milestoneId: 'ms_old', content: 'Old.', contentHtml: '<div>Old.</div>', wordCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
  });
  await Milestone.create({
    _id: 'ms_old', workId: 'work_a', name: 'Old', createdAt: '2026-01-01T00:00:00.000Z',
    chapters: [{ chapterId: 'ch_9', title: 'Nine', order: 0, snapshotId: 'snap_old', wordCount: 1 }],
  });
  const res = await call('post', '/api/works/work_a/milestones/ms_old/chapters/ch_9/restore');
  assert.equal(res.status, 201);
  assert.deepEqual((await Chapter.findById('ch_9').lean()).threadIds, []);
});
