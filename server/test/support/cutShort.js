// Downloads from an Express app over a real socket and cuts the stream short: the Nth
// Snapshot read (failingCall, 1-based) returns one record, then the read fails. With
// failingWork, the first Snapshot read for that work id fails instead (failingCall is ignored).
import http from 'node:http';
import { mock } from 'node:test';
import Snapshot from '../../src/models/Snapshot.js';

export async function cutShortDownload(app, path, user, { failingCall = 1, failingWork } = {}) {
  const failures = mock.method(console, 'error', () => {});
  const realFind = Snapshot.find;
  let calls = 0;
  let brokeWork = false;
  // A Mongoose-cursor-shaped fake: one record, then the connection drops
  const brokenCursor = {
    async close() {},
    [Symbol.asyncIterator]() {
      let reads = 0;
      return {
        async next() {
          if (reads++ === 0) return { done: false, value: { _id: 'snap1', content: 'x' } };
          throw new Error('mongo went away');
        },
      };
    },
  };
  const brokenQuery = { sort: () => brokenQuery, lean: () => brokenQuery, cursor: () => brokenCursor };
  const find = mock.method(Snapshot, 'find', (...args) => {
    if (failingWork !== undefined) {
      const isTarget = !brokeWork && args[0]?.workId === failingWork;
      if (isTarget) brokeWork = true;
      return isTarget ? brokenQuery : realFind.apply(Snapshot, args);
    }
    return ++calls === failingCall ? brokenQuery : realFind.apply(Snapshot, args);
  });

  const server = app.listen(0);
  let timer;
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const outcome = new Promise((resolve) => {
      const state = { status: null, bytes: 0, ended: false, error: null };
      const req = http.request(
        { port: server.address().port, method: 'POST', path, headers: { 'x-test-user': user } },
        (res) => {
          state.status = res.statusCode;
          res.on('data', (chunk) => (state.bytes += chunk.length));
          res.on('end', () => (state.ended = true));
          res.on('error', (err) => (state.error = err));
          res.on('close', () => resolve({ ...state, complete: res.complete }));
        }
      );
      req.on('error', (err) => resolve({ ...state, error: err, complete: false }));
      req.end();
    });
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out: the response never finished or failed')), 2000);
    });
    const result = await Promise.race([outcome, guard]);
    return { ...result, logged: failures.mock.callCount() };
  } finally {
    clearTimeout(timer);
    find.mock.restore();
    failures.mock.restore();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}
