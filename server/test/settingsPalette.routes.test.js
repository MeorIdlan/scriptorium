// The writer's palette (card uqVctsf5): stored on the account, validated on save,
// returned as votive until chosen. HTTP tests against the in-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Settings from '../src/models/Settings.js';

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
});

const call = (method, path, user = 'user_a') => request(app)[method](path).set('x-test-user', user);
const stored = (user = 'user_a') => Settings.findById(user).lean();

test('GET returns votive when nothing is stored', async () => {
  const res = await call('get', '/api/settings');
  assert.equal(res.status, 200);
  assert.equal(res.body.palette, 'votive');
});

test('PUT palette nave is stored per user', async () => {
  const res = await call('put', '/api/settings').send({ palette: 'nave' });
  assert.equal(res.status, 200);
  assert.equal(res.body.palette, 'nave');
  assert.equal((await stored()).palette, 'nave');
  assert.equal((await call('get', '/api/settings')).body.palette, 'nave');
  // Another writer is untouched
  assert.equal((await call('get', '/api/settings', 'user_b')).body.palette, 'votive');
});

test('PUT rejects a bad palette and stores nothing', async () => {
  await call('put', '/api/settings').send({ palette: 'reliquary' });
  for (const bad of ['gold', 5, null, ['nave'], '']) {
    const res = await call('put', '/api/settings').send({ palette: bad });
    assert.equal(res.status, 400, `palette ${JSON.stringify(bad)} should be refused`);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.equal((await stored()).palette, 'reliquary', `palette ${JSON.stringify(bad)} must not change the stored value`);
  }
});

test('a bad palette on a writer who never chose one stores nothing', async () => {
  const res = await call('put', '/api/settings').send({ palette: 'gold' });
  assert.equal(res.status, 400);
  assert.equal(await stored(), null);
});

test('saving the daily goal keeps the palette', async () => {
  await call('put', '/api/settings').send({ palette: 'nave' });
  const res = await call('put', '/api/progress/goal').send({ goal: 500 });
  assert.equal(res.status, 200);
  assert.equal((await call('get', '/api/settings')).body.palette, 'nave');
});

test('saving a provider key keeps the palette', async () => {
  await call('put', '/api/settings').send({ palette: 'nave' });
  const res = await call('put', '/api/settings').send({ providers: { anthropic: { apiKey: 'sk-ant-1234567890abcdef' } } });
  assert.equal(res.status, 200);
  assert.equal(res.body.palette, 'nave');
  assert.equal((await stored()).palette, 'nave');
});
