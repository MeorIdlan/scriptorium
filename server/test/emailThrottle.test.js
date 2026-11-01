import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { emailThrottle, resetEmailThrottle, throttleSize } from '../src/middleware/emailThrottle.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/recover', emailThrottle, (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

function send(app, { ip, email, xff } = {}) {
  const req = request(app).post('/recover');
  if (ip) req.set('CF-Connecting-IP', ip);
  if (xff) req.set('X-Forwarded-For', xff);
  return req.send({ email });
}

function assertRateLimited(res) {
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'RATE_LIMITED');
  const retryAfter = Number(res.headers['retry-after']);
  assert.ok(Number.isInteger(retryAfter), `Retry-After ${res.headers['retry-after']} is an integer`);
  assert.ok(retryAfter >= 1 && retryAfter <= 3600, `Retry-After ${retryAfter} within 1..3600`);
}

beforeEach(() => {
  resetEmailThrottle();
  process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
});

afterEach(() => {
  delete process.env.CLIENT_IP_HEADER;
  mock.timers.reset();
});

test('A1: a client on another IP can still request after one IP hits the 10-per-hour cap', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    const res = await send(app, { ip: '198.51.100.1', email: `a${i}@example.com` });
    assert.equal(res.status, 200, `request ${i + 1} passes`);
  }
  assertRateLimited(await send(app, { ip: '198.51.100.1', email: 'a10@example.com' }));
  const other = await send(app, { ip: '203.0.113.7', email: 'b@example.com' });
  assert.equal(other.status, 200);
});

test('A2: a spoofed X-Forwarded-For does not give a client a fresh bucket', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    const res = await send(app, { ip: '198.51.100.1', email: `a${i}@example.com`, xff: `10.9.9.${i}` });
    assert.equal(res.status, 200);
  }
  assertRateLimited(await send(app, { ip: '198.51.100.1', email: 'z@example.com', xff: '10.9.9.200' }));
});

test('with CLIENT_IP_HEADER unset, a client-sent CF-Connecting-IP is ignored', async () => {
  delete process.env.CLIENT_IP_HEADER;
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    const res = await send(app, { ip: `198.51.100.${i}`, email: `a${i}@example.com` });
    assert.equal(res.status, 200);
  }
  assertRateLimited(await send(app, { ip: '198.51.100.99', email: 'z@example.com' }));
});

test('A3: the 5-per-email cap returns 429 with Retry-After', async () => {
  const app = buildApp();
  for (let i = 0; i < 5; i++) {
    const res = await send(app, { ip: '198.51.100.1', email: 'Victim@Example.com' });
    assert.equal(res.status, 200);
  }
  assertRateLimited(await send(app, { ip: '198.51.100.1', email: 'victim@example.com' }));
  // the same email from another client has its own bucket
  assert.equal((await send(app, { ip: '203.0.113.7', email: 'victim@example.com' })).status, 200);
});

test('A3: the 10-per-IP cap returns 429 with Retry-After counting from the oldest hit', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    await send(app, { ip: '198.51.100.1', email: `a${i}@example.com` });
    mock.timers.tick(60_000);
  }
  const res = await send(app, { ip: '198.51.100.1', email: 'z@example.com' });
  assertRateLimited(res);
  assert.equal(res.headers['retry-after'], String(3600 - 600));
});

test('expired keys are swept so the store does not grow without bound', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const app = buildApp();
  for (let i = 0; i < 20; i++) await send(app, { ip: `198.51.100.${i}`, email: 'a@example.com' });
  assert.equal(throttleSize(), 40);
  mock.timers.tick(60 * 60 * 1000 + 1);
  await send(app, { ip: '203.0.113.7', email: 'b@example.com' });
  assert.equal(throttleSize(), 2);
});

test('addresses in the same IPv6 /64 share one bucket', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    const res = await send(app, { ip: `2402:b400:41fd:b71f::${(i + 1).toString(16)}`, email: `a${i}@example.com` });
    assert.equal(res.status, 200);
  }
  assertRateLimited(await send(app, { ip: '2402:b400:41fd:b71f:dead:beef:0:1', email: 'z@example.com' }));
  // a different /64 is a different client
  assert.equal((await send(app, { ip: '2402:b400:41fd:b720::1', email: 'z@example.com' })).status, 200);
});

test('emails differing only in case or surrounding spaces share a bucket', async () => {
  const app = buildApp();
  for (const email of ['a@x.com', ' a@x.com', 'A@X.COM ', '\ta@x.com', 'a@x.com']) {
    assert.equal((await send(app, { ip: '198.51.100.1', email })).status, 200);
  }
  assertRateLimited(await send(app, { ip: '198.51.100.1', email: '  a@x.com  ' }));
});

for (const [label, body, code] of [
  ['missing', {}, 'MISSING_FIELD'],
  ['blank', { email: '   ' }, 'MISSING_FIELD'],
  ['a number', { email: 5 }, 'INVALID_FIELD'],
  ['an array', { email: ['a@x.com'] }, 'INVALID_FIELD'],
  ['longer than 254 characters', { email: `${'a'.repeat(250)}@x.com` }, 'INVALID_FIELD'],
]) {
  test(`an email that is ${label} is rejected with 400 before anything is stored`, async () => {
    const app = buildApp();
    const res = await request(app).post('/recover').set('CF-Connecting-IP', '198.51.100.1').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, code);
    assert.equal(throttleSize(), 0);
  });
}

test('rejected emails do not count against the client', async () => {
  const app = buildApp();
  for (let i = 0; i < 20; i++) {
    await request(app).post('/recover').set('CF-Connecting-IP', '198.51.100.1').send({ email: `${'x'.repeat(1000)}${i}` });
  }
  assert.equal((await send(app, { ip: '198.51.100.1', email: 'a@example.com' })).status, 200);
});
