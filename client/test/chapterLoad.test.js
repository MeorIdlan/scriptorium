import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterToLoad, createChapterLoader } from '../src/utils/chapterLoad.js';

const chapters = [{ id: 'c1' }, { id: 'c2' }];

test('loads the URL chapter, then the work current chapter, then the first', () => {
  assert.equal(chapterToLoad({ urlChapterId: 'c2', work: { currentChapterId: 'c1' }, chapters, editorChapterId: null, loadedChapterId: null }), 'c2');
  assert.equal(chapterToLoad({ urlChapterId: undefined, work: { currentChapterId: 'c2' }, chapters, editorChapterId: null, loadedChapterId: null }), 'c2');
  assert.equal(chapterToLoad({ urlChapterId: undefined, work: {}, chapters, editorChapterId: null, loadedChapterId: null }), 'c1');
});

test('nothing to load while the list is empty or the chapter is already loaded', () => {
  assert.equal(chapterToLoad({ urlChapterId: 'c1', work: {}, chapters: [], editorChapterId: null, loadedChapterId: null }), null);
  assert.equal(chapterToLoad({ urlChapterId: 'c1', work: {}, chapters, editorChapterId: 'c1', loadedChapterId: 'c1' }), null);
});

test('reloads when the editor remembers the chapter but this page has not loaded its text', () => {
  // Coming back from the Map: EditorContext still holds c2, the Main Room remounted empty
  assert.equal(chapterToLoad({ urlChapterId: 'c2', work: {}, chapters, editorChapterId: 'c2', loadedChapterId: null }), 'c2');
});

// A fake fetch whose replies the test releases by hand
function fakeServer() {
  const pending = [];
  return {
    requested: [],
    fetchChapter(id) {
      this.requested.push(id);
      return new Promise((resolve, reject) => pending.push({ id, resolve, reject }));
    },
    async reply(id, chapter = { id, content: `text of ${id}` }) {
      const i = pending.findIndex((p) => p.id === id);
      pending.splice(i, 1)[0].resolve(chapter);
      await new Promise((r) => setTimeout(r, 0));
    },
    async fail(id, err = new Error('boom')) {
      const i = pending.findIndex((p) => p.id === id);
      pending.splice(i, 1)[0].reject(err);
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

function loaderWith(server) {
  const events = [];
  const loader = createChapterLoader({
    fetchChapter: (id) => server.fetchChapter(id),
    onLoaded: (id, chapter) => events.push(['loaded', id, chapter.content]),
    onError: (id, err) => events.push(['error', id, err.message]),
    onLoadingChange: (id) => events.push(['loading', id]),
  });
  return { loader, events };
}

test('a second load for the chapter already in flight does not fetch again', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c2');
  loader.load('c2');
  assert.deepEqual(server.requested, ['c2']);
  await server.reply('c2');
  assert.deepEqual(events, [['loading', 'c2'], ['loaded', 'c2', 'text of c2'], ['loading', null]]);
});

test('a reply for a chapter the writer has left is dropped', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c2');
  loader.load('c3');
  await server.reply('c3');
  await server.reply('c2');
  assert.deepEqual(events.filter((e) => e[0] === 'loaded'), [['loaded', 'c3', 'text of c3']]);
  assert.deepEqual(events.at(-1), ['loading', null]);
});

test('going back to a chapter while its first fetch is out applies only the newest fetch', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c1');
  loader.load('c2');
  loader.load('c1');
  assert.deepEqual(server.requested, ['c1', 'c2', 'c1']);
  await server.reply('c1', { content: 'old c1' });
  await server.reply('c2');
  await server.reply('c1', { content: 'new c1' });
  assert.deepEqual(events.filter((e) => e[0] === 'loaded'), [['loaded', 'c1', 'new c1']]);
});

test('a failed fetch reports the error and stops loading', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c2');
  await server.fail('c2');
  assert.deepEqual(events, [['loading', 'c2'], ['error', 'c2', 'boom'], ['loading', null]]);
  loader.load('c2');
  assert.deepEqual(server.requested, ['c2', 'c2']);
});

test('a failure for a chapter the writer has left is dropped', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c2');
  loader.load('c3');
  await server.fail('c2');
  assert.deepEqual(events, [['loading', 'c2'], ['loading', 'c3']]);
});

test('cancel drops replies still in flight', async () => {
  const server = fakeServer();
  const { loader, events } = loaderWith(server);
  loader.load('c2');
  loader.cancel();
  await server.reply('c2');
  assert.deepEqual(events, [['loading', 'c2']]);
});
