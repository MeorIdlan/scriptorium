import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { act, click, flush, type } from './support/render.js';
import { renderApp } from './support/app.js';
import { useEditor } from '../src/context/EditorContext.jsx';
import MainRoom from '../src/pages/MainRoom.jsx';

let editor;
function Probe() {
  editor = useEditor();
  return null;
}

const chapter = (id, n) => ({ id, number: n, title: `Title ${id}`, wordCount: 1 });
const body = (id) => ({ id, content: `text of ${id}`, contentHtml: `<p>text of ${id}</p>` });

// Replies for one chapter that wait until the test releases them, oldest first
function heldReplies() {
  const waiting = [];
  return {
    route: () => new Promise((resolve) => waiting.push(resolve)),
    get count() {
      return waiting.length;
    },
    async releaseNext(reply) {
      const resolve = waiting.shift();
      await act(async () => resolve(reply));
      await flush();
    },
  };
}

function routesFor(chapters, extra = {}) {
  return {
    'GET /works/w1': { id: 'w1', title: 'Book', currentChapterId: 'c1' },
    'GET /works/w1/chapters': () => chapters,
    'GET /works/w1/chapters/c1': body('c1'),
    'GET /works/w1/chapters/c3': body('c3'),
    'GET /works/w1/catches': [],
    'GET /works/w1/codex': {},
    'GET /works/w1/map': {},
    'GET /works/w1/threads': [],
    'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
    ...extra,
  };
}

async function openMainRoom(routes, path = '/work/w1/chapter/c1') {
  return renderApp(h(Fragment, null, h(MainRoom), h(Probe)), {
    routes,
    path,
    route: '/work/:workId/chapter/:chapterId',
  });
}

const gets = (view, id) => view.fetch.calls.filter((c) => c.method === 'GET' && c.path === `/works/w1/chapters/${id}`).length;
const chapterButton = (view, id) => view.button(`Title ${id}`);

// Types into the editor the way a browser does: the DOM changes, then input fires
async function typeInEditor(view, html) {
  const el = view.query('.editor');
  await act(async () => {
    el.innerHTML = html;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
}

const threeChapters = [chapter('c1', 1), chapter('c2', 2), chapter('c3', 3)];

test('a sidebar switch fetches the chapter once (A1)', async () => {
  const c2 = heldReplies();
  const view = await openMainRoom(routesFor(threeChapters, { 'GET /works/w1/chapters/c2': c2.route }));
  await click(chapterButton(view, 'c2'));
  while (c2.count) await c2.releaseNext(body('c2'));
  assert.equal(gets(view, 'c2'), 1);
  assert.equal(editor.state.chapterId, 'c2');
});

test('a slow response never resets text typed after the switch (A2, A4)', async () => {
  const c2 = heldReplies();
  const view = await openMainRoom(routesFor(threeChapters, { 'GET /works/w1/chapters/c2': c2.route }));
  await click(chapterButton(view, 'c2'));
  await c2.releaseNext(body('c2'));
  await typeInEditor(view, '<p>text of c2 and more</p>');
  // Any further reply for c2 arrives after the writer started typing
  while (c2.count) await c2.releaseNext(body('c2'));
  assert.equal(editor.state.content, 'text of c2 and more');
  assert.equal(editor.state.hasUnsavedChanges, true);
});

test('a late response for the previous chapter is ignored (A2, A4)', async () => {
  const c2 = heldReplies();
  const c3 = heldReplies();
  const view = await openMainRoom(
    routesFor(threeChapters, { 'GET /works/w1/chapters/c2': c2.route, 'GET /works/w1/chapters/c3': c3.route })
  );
  await click(chapterButton(view, 'c2'));
  await click(chapterButton(view, 'c3'));
  // c3 answers first, then the slow c2 replies land
  await c3.releaseNext(body('c3'));
  while (c2.count) await c2.releaseNext(body('c2'));
  assert.equal(gets(view, 'c3'), 1);
  assert.equal(editor.state.chapterId, 'c3');
  assert.equal(editor.state.content, 'text of c3');
  assert.equal(view.query('.editor').textContent, 'text of c3');
});

test('add chapter loads it once', async () => {
  let chapters = threeChapters;
  const c4 = heldReplies();
  const view = await openMainRoom(
    routesFor(threeChapters, {
      'GET /works/w1/chapters': () => chapters,
      'POST /works/w1/chapters': () => {
        chapters = [...threeChapters, chapter('c4', 4)];
        return chapter('c4', 4);
      },
      'GET /works/w1/chapters/c4': c4.route,
    })
  );
  await click(view.query('button[title="Add chapter"]'));
  await type(view.query('.chapter-add-input'), 'Four');
  await click(view.button('Add'));
  while (c4.count) await c4.releaseNext(body('c4'));
  assert.equal(gets(view, 'c4'), 1);
  assert.equal(editor.state.chapterId, 'c4');
});
