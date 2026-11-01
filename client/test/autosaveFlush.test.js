import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment, useState } from 'react';
import { act, flush } from './support/render.js';
import { renderApp, HttpError } from './support/app.js';
import { useEditor } from '../src/context/EditorContext.jsx';
import { useActiveWork } from '../src/context/ActiveWorkContext.jsx';
import Editor from '../src/components/editor/Editor.jsx';
import WordCounter from '../src/components/editor/WordCounter.jsx';

let editor;
let work;
let hideEditor;
// Unmounts only the Editor, as a chapter switch or leaving the room does;
// the editor state and the footer counter live on
function Host() {
  editor = useEditor();
  work = useActiveWork();
  const [shown, setShown] = useState(true);
  hideEditor = () => setShown(false);
  return h(Fragment, null, shown ? h(Editor, { workId: 'w1' }) : null, h(WordCounter));
}

async function leave() {
  await act(async () => hideEditor());
  await flush();
}

const puts = (view) => view.fetch.calls.filter((c) => c.method === 'PUT');

// The work's chapter list as GET /chapters gave it: c1 (2 words) is open, c2 has 10, so the Total reads 12
const chapters = [
  { id: 'c1', number: 1, title: 'One', wordCount: 2 },
  { id: 'c2', number: 2, title: 'Two', wordCount: 10 },
];

async function openEditor(routes = {}) {
  const view = await renderApp(h(Host), {
    routes: {
      'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
      'GET /works/w1': { id: 'w1' },
      'GET /works/w1/chapters': chapters,
      ...routes,
    },
  });
  await act(async () => work.loadWork('w1'));
  await act(async () => editor.loadContent('c1', 'old words', '<p>old words</p>'));
  await flush();
  return view;
}

// Types new text, then lets the five-second autosave timer fire and its save settle
async function typeAndAutosave(t, text) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await act(async () => editor.setContent(text, `<p>${text}</p>`));
  t.mock.timers.tick(5000);
  t.mock.timers.reset();
  await flush();
}

test("a timed save refreshes the Total from the server's count", async (t) => {
  const view = await openEditor({ 'PUT /works/w1/chapters/c1': { id: 'c1', wordCount: 3 } });
  assert.match(view.text(), /Total: 12 words/);
  await typeAndAutosave(t, 'new words here');
  assert.equal(puts(view).length, 1);
  assert.match(view.text(), /Total: 13 words/);
});

test('a save reply without a count leaves the Total alone', async (t) => {
  const view = await openEditor({ 'PUT /works/w1/chapters/c1': {} });
  await typeAndAutosave(t, 'new words here');
  assert.equal(puts(view).length, 1);
  assert.match(view.text(), /Total: 12 words/);
});

test('unmounting with unsaved text saves it to its own chapter', async () => {
  const view = await openEditor();
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  await leave();
  assert.deepEqual(
    puts(view).map((c) => [c.path, c.body]),
    [['/works/w1/chapters/c1', { content: 'new words', contentHtml: '<p>new words</p>' }]]
  );
});

test('the save on unmount refreshes the Total', async () => {
  const view = await openEditor({ 'PUT /works/w1/chapters/c1': { id: 'c1', wordCount: 3 } });
  await act(async () => editor.setContent('new words here', '<p>new words here</p>'));
  await leave();
  assert.equal(puts(view).length, 1);
  assert.match(view.text(), /Total: 13 words/);
});

test('no save on unmount when nothing changed', async () => {
  const view = await openEditor();
  await leave();
  assert.equal(puts(view).length, 0);
});

test('no extra save on unmount after the timed save went out', async (t) => {
  const view = await openEditor();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  t.mock.timers.tick(5000);
  t.mock.timers.reset();
  await flush();
  assert.equal(puts(view).length, 1);
  await leave();
  assert.equal(puts(view).length, 1);
});

test('a failed save on unmount shows the error', async () => {
  const view = await openEditor({ 'PUT /works/w1/chapters/c1': new HttpError(500, 'SERVER_ERROR') });
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  const logged = console.error;
  console.error = () => {};
  try {
    await leave();
  } finally {
    console.error = logged;
  }
  assert.equal(editor.state.saveStatus, 'error');
  assert.match(view.text(), /Total: 12 words/);
});

test('a failed timed save leaves the Total alone', async (t) => {
  const view = await openEditor({ 'PUT /works/w1/chapters/c1': new HttpError(500, 'SERVER_ERROR') });
  const logged = console.error;
  console.error = () => {};
  try {
    await typeAndAutosave(t, 'new words here');
  } finally {
    console.error = logged;
  }
  assert.equal(editor.state.saveStatus, 'error');
  assert.match(view.text(), /Total: 12 words/);
});
