import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { writeWorkBackup, jsonArray } from '../src/services/backupService.js';

// A "cursor" of big rows that records when each row is read and when it is closed
function fakeCursor(events, state) {
  return (async function* () {
    try {
      for (let i = 0; i < 4; i++) {
        events.push(`read ${i}`);
        yield { id: String(i), content: 'x'.repeat(100_000) };
      }
    } finally {
      state.closed = true;
    }
  })();
}

function entriesFrom(events, state) {
  return async function* () {
    const stats = { count: 0 };
    yield { path: 'snapshots.json', kind: 'snapshots', chunks: jsonArray(fakeCursor(events, state), stats), stats };
  };
}

test('bytes reach the output while later rows are still unread (A4 automated)', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.on('data', () => events.push('write'));
  await writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) });

  const firstWrite = events.indexOf('write');
  const lastRead = events.lastIndexOf('read 3');
  assert.ok(firstWrite >= 0, 'some bytes were written');
  assert.ok(firstWrite < lastRead, 'a write happened before the last row was read');
});

test('a client disconnect stops the reads, closes the cursor and rejects (review focus 4)', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.resume();
  const firstWrite = new Promise((resolve) => output.once('data', resolve));

  const run = writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) });
  await firstWrite;
  output.destroy();

  await assert.rejects(run);
  assert.equal(state.closed, true, 'the Mongo cursor was closed');
  assert.ok(!events.includes('read 3'), 'reading stopped before the last row');
});

test('a read error mid-archive rejects instead of hanging', async () => {
  const output = new PassThrough();
  output.resume();
  async function* failing() {
    yield { id: '0' };
    throw new Error('mongo went away');
  }
  const entries = async function* () {
    const stats = { count: 0 };
    yield { path: 'snapshots.json', kind: 'snapshots', chunks: jsonArray(failing(), stats), stats };
  };
  await assert.rejects(writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries }), /mongo went away/);
});

// Fails the test instead of hanging it if the promise never settles
function withTimeout(promise, ms = 2000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out: writeWorkBackup hung')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('an output destroyed before the call rejects promptly and reads nothing', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.destroy();
  await new Promise((resolve) => output.once('close', resolve));

  await assert.rejects(
    withTimeout(writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) })),
    /client disconnected/
  );
  assert.deepEqual(events, [], 'no row was read');
});

test('an output error mid-archive rejects without an uncaught exception', async () => {
  const events = [];
  const state = { closed: false };
  const output = new PassThrough();
  output.resume();
  const firstWrite = new Promise((resolve) => output.once('data', resolve));

  const uncaught = [];
  const onUncaught = (err) => uncaught.push(err);
  process.on('uncaughtException', onUncaught);
  try {
    const run = writeWorkBackup({ _id: 'work_a', title: 'A' }, output, { entries: entriesFrom(events, state) });
    await firstWrite;
    output.destroy(new Error('socket reset'));

    await assert.rejects(withTimeout(run));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(uncaught, [], 'no uncaught exception');
    assert.equal(state.closed, true, 'the Mongo cursor was closed');
  } finally {
    process.off('uncaughtException', onUncaught);
  }
});
