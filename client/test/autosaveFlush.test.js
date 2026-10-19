import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { act, flush } from './support/render.js';
import { renderApp, HttpError } from './support/app.js';
import { useEditor } from '../src/context/EditorContext.jsx';
import Editor from '../src/components/editor/Editor.jsx';

let editor;
let hideEditor;
// Unmounts only the Editor, as a chapter switch or leaving the room does;
// the editor state lives on in its provider
function Host() {
  editor = useEditor();
  const [shown, setShown] = useState(true);
  hideEditor = () => setShown(false);
  return shown ? h(Editor, { workId: 'w1' }) : null;
}

async function leave() {
  await act(async () => hideEditor());
  await flush();
}

const puts = (view) => view.fetch.calls.filter((c) => c.method === 'PUT');

async function openEditor(routes = {}) {
  const view = await renderApp(h(Host), {
    routes: { 'GET /progress/today': { date: '2026-10-19', words: 0, goal: null }, ...routes },
  });
  await act(async () => editor.loadContent('c1', 'old words', '<p>old words</p>'));
  await flush();
  return view;
}

test('unmounting with unsaved text saves it to its own chapter', async () => {
  const view = await openEditor();
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  await leave();
  assert.deepEqual(
    puts(view).map((c) => [c.path, c.body]),
    [['/works/w1/chapters/c1', { content: 'new words', contentHtml: '<p>new words</p>' }]]
  );
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
});
