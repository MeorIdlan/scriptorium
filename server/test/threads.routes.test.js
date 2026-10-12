import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import PlotThread from '../src/models/PlotThread.js';

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
    { _id: 'work_b', ownerId: 'user_b', title: 'B' },
  ]);
});

const base = (work = 'work_a') => `/api/works/${work}/threads`;
const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const create = (body, work = 'work_a', user = 'user_a') => call('post', base(work), user).send(body);

test('a writer creates, renames, recolours, describes and deletes a thread', async () => {
  const created = await create({ name: 'The missing heir' });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.match(id, /^thr_\d+_[0-9a-f]{6}$/);
  assert.equal(created.body.status, 'open');
  assert.equal(created.body.color, '#c9a96e');
  assert.equal(created.body.description, '');

  let res = await call('put', `${base()}/${id}`).send({ name: 'The lost heir' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'The lost heir');
  res = await call('put', `${base()}/${id}`).send({ color: '#7FA7D9' });
  assert.equal(res.body.color, '#7fa7d9');
  res = await call('put', `${base()}/${id}`).send({ description: '  Who is Ada really?  ' });
  assert.equal(res.body.description, 'Who is Ada really?');

  res = await call('get', base());
  assert.deepEqual(res.body.map((t) => t.name), ['The lost heir']);

  res = await call('delete', `${base()}/${id}`);
  assert.equal(res.status, 204);
  assert.equal(await PlotThread.countDocuments(), 0);
});

test('status moves between open and resolved', async () => {
  const { id } = (await create({ name: 'Debt' })).body;
  let res = await call('put', `${base()}/${id}`).send({ status: 'resolved' });
  assert.equal(res.body.status, 'resolved');
  res = await call('put', `${base()}/${id}`).send({ status: 'open' });
  assert.equal(res.body.status, 'open');
  res = await call('put', `${base()}/${id}`).send({ status: 'closed' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_FIELD');
});

test('new threads take the next palette colour and go last', async () => {
  for (const name of ['One', 'Two', 'Three']) await create({ name });
  const res = await call('get', base());
  assert.deepEqual(res.body.map((t) => [t.name, t.color, t.order]), [
    ['One', '#c9a96e', 0],
    ['Two', '#7fa7d9', 1],
    ['Three', '#d97f7f', 2],
  ]);
  const own = await create({ name: 'Four', color: '#123456' });
  assert.equal(own.body.color, '#123456');
});

test('bad fields are refused with 400', async () => {
  const cases = [
    [{}, 'MISSING_FIELD'],
    [{ name: '   ' }, 'MISSING_FIELD'],
    [{ name: 'x'.repeat(81) }, 'INVALID_FIELD'],
    [{ name: 'A', color: 'red' }, 'INVALID_FIELD'],
    [{ name: 'A', status: 'done' }, 'INVALID_FIELD'],
    [{ name: 'A', description: 'x'.repeat(1001) }, 'INVALID_FIELD'],
    [{ name: 'A', workId: 'work_b' }, 'INVALID_FIELD'],
  ];
  for (const [body, code] of cases) {
    const res = await create(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.code, code);
  }
  const { id } = (await create({ name: 'Ok' })).body;
  const res = await call('put', `${base()}/${id}`).send({ order: 3 });
  assert.equal(res.status, 400);
  assert.equal(await PlotThread.countDocuments(), 1);
});

test('names are unique per work, ignoring case and spaces', async () => {
  await create({ name: "Mara's debt" });
  let res = await create({ name: " mara's DEBT " });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'DUPLICATE_NAME');
  res = await create({ name: "Mara's debt" }, 'work_a2');
  assert.equal(res.status, 201);

  const other = (await create({ name: 'The storm' })).body;
  res = await call('put', `${base()}/${other.id}`).send({ name: "MARA'S DEBT" });
  assert.equal(res.status, 409);
  res = await call('put', `${base()}/${other.id}`).send({ name: 'THE STORM' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'THE STORM');
});

test('names with regex characters do not collide with others', async () => {
  assert.equal((await create({ name: 'Who (really) did it?' })).status, 201);
  assert.equal((await create({ name: 'Who .* did it?' })).status, 201);
  assert.equal((await create({ name: 'who (REALLY) did it?' })).status, 409);
});

test('reorder sets the order and refuses partial or foreign lists', async () => {
  const ids = [];
  for (const name of ['A', 'B', 'C']) ids.push((await create({ name })).body.id);
  let res = await call('put', `${base()}/reorder`).send({ ids: [ids[2], ids[0], ids[1]] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((t) => t.name), ['C', 'A', 'B']);

  const foreign = (await create({ name: 'X' }, 'work_a2')).body.id;
  for (const bad of [[ids[0], ids[1]], [ids[0], ids[0], ids[1]], [ids[0], ids[1], foreign], 'nope']) {
    res = await call('put', `${base()}/reorder`).send({ ids: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  res = await call('get', base());
  assert.deepEqual(res.body.map((t) => t.name), ['C', 'A', 'B']);
});

test("another writer can't reach the work's threads", async () => {
  const { id } = (await create({ name: 'Secret' })).body;
  const attempts = [
    call('get', base(), 'user_b'),
    call('post', base(), 'user_b').send({ name: 'Mine' }),
    call('put', `${base()}/${id}`, 'user_b').send({ name: 'Taken' }),
    call('put', `${base()}/reorder`, 'user_b').send({ ids: [id] }),
    call('delete', `${base()}/${id}`, 'user_b'),
  ];
  for (const res of await Promise.all(attempts)) {
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  }
  const thread = await PlotThread.findById(id).lean();
  assert.equal(thread.name, 'Secret');
  assert.equal(await PlotThread.countDocuments(), 1);
});

test('a thread id from another work of the same writer is not found', async () => {
  const { id } = (await create({ name: 'Elsewhere' }, 'work_a2')).body;
  assert.equal((await call('put', `${base()}/${id}`).send({ name: 'Moved' })).status, 404);
  assert.equal((await call('delete', `${base()}/${id}`)).status, 404);
  assert.equal((await PlotThread.findById(id).lean()).name, 'Elsewhere');
});

test('an unknown thread id is not found', async () => {
  const res = await call('put', `${base()}/thr_0_000000`).send({ name: 'Ghost' });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});
