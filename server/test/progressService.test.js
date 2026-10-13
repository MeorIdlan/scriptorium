import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startDb, clearDb } from './support/http.js';
import { addDailyWords, getDailyWords, dayKeyForRequest } from '../src/services/progressService.js';

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

const fakeReq = (headers = {}) => ({ get: (name) => headers[name] });

test('words accumulate for the same writer and day', async () => {
  await addDailyWords('user_a', '2026-10-14', 30);
  await addDailyWords('user_a', '2026-10-14', 12);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 42);
});

test('days and writers are kept apart', async () => {
  await addDailyWords('user_a', '2026-10-14', 30);
  await addDailyWords('user_a', '2026-10-15', 5);
  await addDailyWords('user_b', '2026-10-14', 7);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 30);
  assert.equal(await getDailyWords('user_a', '2026-10-15'), 5);
  assert.equal(await getDailyWords('user_b', '2026-10-14'), 7);
});

test('zero or negative gains write nothing', async () => {
  await addDailyWords('user_a', '2026-10-14', 0);
  await addDailyWords('user_a', '2026-10-14', -4);
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 0);
});

test('no row reads as zero words', async () => {
  assert.equal(await getDailyWords('user_new', '2026-10-14'), 0);
});

test('the request day key uses the X-Timezone header', () => {
  const now = new Date('2026-10-14T18:16:00Z'); // 00:01 on 15 Oct in Kathmandu
  assert.equal(dayKeyForRequest(fakeReq({ 'X-Timezone': 'Asia/Kathmandu' }), now), '2026-10-15');
});

test('a missing or invalid zone falls back to the UTC day (review focus 1)', () => {
  const now = new Date('2026-10-14T18:16:00Z');
  assert.equal(dayKeyForRequest(fakeReq(), now), '2026-10-14');
  assert.equal(dayKeyForRequest(fakeReq({ 'X-Timezone': 'Mars/Olympus' }), now), '2026-10-14');
});
