import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';

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

const setGoal = (goal, user = 'user_a') =>
  request(app).put('/api/progress/goal').set('x-test-user', user).send({ goal });
const today = (user = 'user_a') => request(app).get('/api/progress/today').set('x-test-user', user);

test('a writer with no settings and no progress reads zero and no goal (review focus 4)', async () => {
  const res = await today();
  assert.equal(res.status, 200);
  assert.match(res.body.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual({ words: res.body.words, goal: res.body.goal }, { words: 0, goal: null });
});

test('the goal can be set, changed and cleared (A1)', async () => {
  assert.equal((await setGoal(500)).body.goal, 500);
  assert.equal((await today()).body.goal, 500);

  assert.equal((await setGoal(800)).body.goal, 800);
  assert.equal((await today()).body.goal, 800);

  assert.equal((await setGoal(null)).body.goal, null);
  assert.equal((await today()).body.goal, null);
});

test('invalid goals are refused and nothing is saved (review focus 3)', async () => {
  for (const bad of [0, -5, 2.5, '500', 100001]) {
    const res = await setGoal(bad);
    assert.equal(res.status, 400, `goal ${JSON.stringify(bad)} should be refused`);
    assert.equal(res.body.code, 'INVALID_GOAL');
  }
  const missing = await request(app).put('/api/progress/goal').set('x-test-user', 'user_a').send({});
  assert.equal(missing.status, 400);
  assert.equal((await today()).body.goal, null);
});

test('the goal belongs to one writer', async () => {
  await setGoal(500, 'user_a');
  assert.equal((await today('user_b')).body.goal, null);
});
