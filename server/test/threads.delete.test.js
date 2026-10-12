import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Snapshot from '../src/models/Snapshot.js';
import PlotThread from '../src/models/PlotThread.js';
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
  await Work.create([
    { _id: 'work_a', ownerId: 'user_a', title: 'A' },
    { _id: 'work_a2', ownerId: 'user_a', title: 'A2' },
  ]);
});

const call = (method, path) => request(app)[method](path).set('x-test-user', 'user_a');
const create = async (name, work = 'work_a') => (await call('post', `/api/works/${work}/threads`).send({ name })).body.id;
const hr = (id, threads) => `<hr data-scene="${id}"${threads ? ` data-threads="${threads}"` : ''} data-status="draft" />`;

async function chapter(_id, workId, contentHtml, threadIds = []) {
  await Chapter.create({ _id, workId, title: _id, contentHtml, threadIds, scenes: sceneSummaries(contentHtml) });
}

test('deleting a thread strips it from chapter tags, scene markers and derived scenes', async () => {
  const a = await create('Heir');
  const b = await create('Storm');
  const html = `${hr('scn_1', `${a} ${b}`)}<div>One.</div>${hr('scn_2', a)}<div>Two.</div>`;
  await chapter('ch_1', 'work_a', html, [a, b]);
  await chapter('ch_2', 'work_a', '<div>Untouched.</div>');
  await Snapshot.create({ _id: 'snap_1', workId: 'work_a', chapterId: 'ch_1', kind: 'auto', contentHtml: html, createdAt: new Date().toISOString() });

  assert.equal((await call('delete', `/api/works/work_a/threads/${a}`)).status, 204);

  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, [b]);
  assert.equal(ch.contentHtml, `${hr('scn_1', b)}<div>One.</div>${hr('scn_2')}<div>Two.</div>`);
  assert.deepEqual(ch.scenes.map((s) => s.threadIds), [[b], []]);
  assert.equal((await Chapter.findById('ch_2').lean()).contentHtml, '<div>Untouched.</div>');
  assert.equal((await Snapshot.findById('snap_1').lean()).contentHtml, html);

  await call('delete', `/api/works/work_a/threads/${b}`);
  const after = await Chapter.findById('ch_1').lean();
  assert.deepEqual(after.threadIds, []);
  assert.doesNotMatch(after.contentHtml, /data-threads/);
});

test('a tag id that only starts with the deleted id is kept', async () => {
  const a = await create('Short');
  const longer = `${a}ff`;
  await chapter('ch_1', 'work_a', `${hr('scn_1', `${a} ${longer}`)}<div>One.</div>`, [a, longer]);

  await call('delete', `/api/works/work_a/threads/${a}`);

  const ch = await Chapter.findById('ch_1').lean();
  assert.deepEqual(ch.threadIds, [longer]);
  assert.equal(ch.contentHtml, `${hr('scn_1', longer)}<div>One.</div>`);
});

test("cleanup doesn't touch another work's chapters", async () => {
  const a = await create('Heir');
  const html = `${hr('scn_1', a)}<div>Stray.</div>`;
  await chapter('ch_x', 'work_a2', html, [a]);

  await call('delete', `/api/works/work_a/threads/${a}`);

  const ch = await Chapter.findById('ch_x').lean();
  assert.equal(ch.contentHtml, html);
  assert.deepEqual(ch.threadIds, [a]);
});

test('deleting a work deletes its threads', async () => {
  await create('Heir');
  await create('Storm');
  await create('Kept', 'work_a2');

  assert.equal((await call('delete', '/api/works/work_a')).status, 204);

  assert.equal(await PlotThread.countDocuments({ workId: 'work_a' }), 0);
  assert.equal(await PlotThread.countDocuments({ workId: 'work_a2' }), 1);
});
