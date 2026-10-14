import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, clearDb, buildApp } from './support/http.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import { getDailyWords } from '../src/services/progressService.js';

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
  await Chapter.create({ _id: 'ch_1', workId: 'work_a', number: 1, title: 'One', content: '', wordCount: 0 });
});

const save = (content, headers = { 'X-Timezone': 'UTC' }) => {
  const req = request(app).put('/api/works/work_a/chapters/ch_1').set('x-test-user', 'user_a');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send({ content });
};
const todayUtc = () => new Date().toISOString().slice(0, 10);

test("a save adds the gain to today's count (A5)", async () => {
  assert.equal((await save('one two three')).status, 200);
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('deleting text adds nothing (A4)', async () => {
  await save('one two three');
  await save('one');
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('two saves add up', async () => {
  await save('one two');
  await save('one two three four');
  assert.equal(await getDailyWords('user_a', todayUtc()), 4);
});

test('a move within one save adds nothing (A4)', async () => {
  await save('alpha beta gamma');
  await save('gamma beta alpha');
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('two tabs saving the same chapter at once do not double count (review focus 2)', async () => {
  await Promise.all([save('one two'), save('one two three four five')]);
  const chapter = await Chapter.findById('ch_1').lean();
  assert.equal(await getDailyWords('user_a', todayUtc()), chapter.wordCount);
});

test('a missing or invalid X-Timezone still saves and counts under UTC (review focus 1)', async () => {
  assert.equal((await save('one two', {})).status, 200);
  assert.equal((await save('one two three', { 'X-Timezone': 'Mars/Olympus' })).status, 200);
  assert.equal(await getDailyWords('user_a', todayUtc()), 3);
});

test('a save at 23:59 and 00:01 in Kathmandu lands on different days (A3, review focus 5)', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-14T18:14:00Z') }); // 23:59 on 14 Oct
  try {
    await save('one two', { 'X-Timezone': 'Asia/Kathmandu' });
    mock.timers.setTime(new Date('2026-10-14T18:16:00Z').getTime()); // 00:01 on 15 Oct
    await save('one two three', { 'X-Timezone': 'Asia/Kathmandu' });
  } finally {
    mock.timers.reset();
  }
  assert.equal(await getDailyWords('user_a', '2026-10-14'), 2);
  // the second save grows the chapter from 2 to 3 words, so only the gain of 1 lands on the 15th
  assert.equal(await getDailyWords('user_a', '2026-10-15'), 1);
});
