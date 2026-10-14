import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { writeWorkBackup, jsonArray } from '../src/services/backupService.js';
import Work from '../src/models/Work.js';
import Chapter from '../src/models/Chapter.js';
import Codex from '../src/models/Codex.js';
import MapModel from '../src/models/Map.js';
import Catch from '../src/models/Catch.js';
import PlotThread from '../src/models/PlotThread.js';
import Milestone from '../src/models/Milestone.js';
import Snapshot from '../src/models/Snapshot.js';

// A Mongoose-QueryCursor-shaped fake: next() and close(), and an async iterator
// with NO return(), so breaking out of a `for await` does not close it.
// Only an explicit close() sets state.closed.
function cursorOf(rows, events, state, onRead = () => {}) {
  let i = 0;
  const cursor = {
    async next() {
      if (state.closed || i >= rows.length) return { done: true, value: undefined };
      events.push(`read ${i}`);
      onRead();
      return { done: false, value: rows[i++] };
    },
    async close() {
      state.closed = true;
    },
    [Symbol.asyncIterator]() {
      return { next: () => cursor.next() };
    },
  };
  return cursor;
}

// A "cursor" of big rows that records when each row is read and when it is closed
function fakeCursor(events, state) {
  const rows = Array.from({ length: 4 }, (_, i) => ({ id: String(i), content: 'x'.repeat(100_000) }));
  return cursorOf(rows, events, state);
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

// A chainable stand-in for Model.find(...).sort().select().lean().cursor()
function queryReturning(cursor) {
  const query = { sort: () => query, select: () => query, lean: () => query, cursor: () => cursor };
  return query;
}

// Stubs every model read workEntries makes. Chapter.find is called three times
// (chapters.json, scenes.json, chapter files); call number `bigAt` gets big rows,
// every other cursor is empty. `cursors` records each cursor's state in call order.
function stubModels(bigAt, events) {
  const cursors = [];
  let firstRead;
  const read = new Promise((resolve) => {
    firstRead = resolve;
  });
  let chapterCalls = 0;
  const next = (rows) => {
    const state = { closed: false };
    cursors.push(state);
    return queryReturning(cursorOf(rows, events, state, rows.length ? firstRead : undefined));
  };
  const big = Array.from({ length: 4 }, (_, i) => ({
    _id: `c${i}`,
    title: 'x'.repeat(100_000),
    content: 'x'.repeat(100_000),
  }));
  mock.method(Work, 'findById', () => ({ lean: async () => ({ _id: 'work_a', title: 'A', ownerId: 'u' }) }));
  mock.method(Codex, 'findOne', () => ({ lean: async () => null }));
  mock.method(MapModel, 'findOne', () => ({ lean: async () => null }));
  mock.method(Chapter, 'find', () => next(chapterCalls++ === bigAt ? big : []));
  for (const model of [Catch, PlotThread, Milestone, Snapshot]) mock.method(model, 'find', () => next([]));
  cursors.firstRead = read; // settles when the big cursor serves its first row
  return cursors;
}

// Which Chapter.find the big rows belong to, and the cursor index that call gets
const READS = [
  { name: 'chapters.json (mapped)', bigAt: 0, cursorIndex: 0 },
  { name: 'chapter files loop', bigAt: 2, cursorIndex: 2 },
];

for (const { name, bigAt, cursorIndex } of READS) {
  test(`a client disconnect closes the Mongo cursor behind ${name} and rejects (review focus 4)`, async (t) => {
    const events = [];
    const cursors = stubModels(bigAt, events);
    t.after(() => mock.restoreAll());
    const output = new PassThrough();
    output.resume();

    const run = writeWorkBackup({ _id: 'work_a', title: 'A' }, output);
    await cursors.firstRead;
    output.destroy();

    await assert.rejects(run);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cursors[cursorIndex].closed, true, 'the Mongo cursor was closed');
    assert.ok(!events.includes('read 3'), 'reading stopped before the last row');
  });

  test(`a read error closes the Mongo cursor behind ${name}`, async (t) => {
    const events = [];
    const cursors = stubModels(bigAt, events);
    t.after(() => mock.restoreAll());
    // The cursor throws on its second read, as a dropped Mongo connection would
    const original = Chapter.find;
    let calls = 0;
    mock.method(Chapter, 'find', (...args) => {
      const query = original(...args);
      if (calls++ !== bigAt) return query;
      const cursor = query.cursor();
      let reads = 0;
      const realNext = cursor.next;
      cursor.next = async () => {
        if (reads++ === 1) throw new Error('mongo went away');
        return realNext();
      };
      return queryReturning(cursor);
    });
    const output = new PassThrough();
    output.resume();
    await assert.rejects(writeWorkBackup({ _id: 'work_a', title: 'A' }, output), /mongo went away/);
    assert.equal(cursors[cursorIndex].closed, true, 'the Mongo cursor was closed');
  });
}

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

test('an output error mid-archive rejects without an uncaught exception and closes the cursor', async (t) => {
  const events = [];
  const cursors = stubModels(0, events);
  t.after(() => mock.restoreAll());
  const output = new PassThrough();
  output.resume();

  const uncaught = [];
  const onUncaught = (err) => uncaught.push(err);
  process.on('uncaughtException', onUncaught);
  try {
    const run = writeWorkBackup({ _id: 'work_a', title: 'A' }, output);
    await cursors.firstRead;
    output.destroy(new Error('socket reset'));

    await assert.rejects(withTimeout(run));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(uncaught, [], 'no uncaught exception');
    assert.equal(cursors[0].closed, true, 'the Mongo cursor was closed');
  } finally {
    process.off('uncaughtException', onUncaught);
  }
});
