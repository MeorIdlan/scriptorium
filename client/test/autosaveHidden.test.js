import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, flush } from './support/render.js';
import { renderApp, HttpError } from './support/app.js';
import { createElement as h, Fragment } from 'react';
import { useEditor } from '../src/context/EditorContext.jsx';
import { useActiveWork } from '../src/context/ActiveWorkContext.jsx';
import Editor from '../src/components/editor/Editor.jsx';

let editor;
let work;
function Host() {
  editor = useEditor();
  work = useActiveWork();
  return h(Fragment, null, h(Editor, { workId: 'w1' }));
}

const puts = (view) => view.fetch.calls.filter((c) => c.method === 'PUT');

async function openEditor(routes = {}) {
  const view = await renderApp(h(Host), {
    routes: {
      'GET /progress/today': { date: '2026-10-19', words: 0, goal: null },
      'GET /works/w1': { id: 'w1' },
      'GET /works/w1/chapters': [{ id: 'c1', number: 1, title: 'One', wordCount: 2 }],
      ...routes,
    },
  });
  await act(async () => work.loadWork('w1'));
  await act(async () => editor.loadContent('c1', 'old words', '<p>old words</p>'));
  await flush();
  return view;
}

// The page goes to the background: a phone locking its screen or switching apps
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
async function hide() {
  setVisibility('hidden');
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  await flush();
}
async function pagehide() {
  await act(async () => window.dispatchEvent(new window.Event('pagehide')));
  await flush();
}

afterEach(() => {
  delete document.visibilityState;
});

test('hiding the page saves the unsaved text at once, with keepalive, and the timer then sends nothing more', async (t) => {
  const view = await openEditor();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  // With the timers mocked, flush() would wait forever: hide without it, then settle
  setVisibility('hidden');
  document.dispatchEvent(new window.Event('visibilitychange'));
  t.mock.timers.tick(5000);
  t.mock.timers.reset();
  await flush();
  assert.equal(puts(view).length, 1, 'expected exactly one save');
  assert.deepEqual(puts(view)[0].body, { content: 'new words', contentHtml: '<p>new words</p>' });
  assert.equal(puts(view)[0].path, '/works/w1/chapters/c1');
  assert.equal(puts(view)[0].keepalive, true);
});

test('pagehide saves it too', async () => {
  const view = await openEditor();
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  await pagehide();
  assert.equal(puts(view).length, 1);
  assert.equal(puts(view)[0].keepalive, true);
});

test('the page coming back to the front saves nothing', async () => {
  const view = await openEditor();
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  setVisibility('visible');
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  await flush();
  assert.equal(puts(view).length, 0);
});

test('with nothing unsaved, hiding or leaving sends no request', async () => {
  const view = await openEditor();
  await hide();
  await pagehide();
  assert.equal(puts(view).length, 0);
});

test('visibilitychange then pagehide for one edit sends one request', async () => {
  const view = await openEditor();
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  await hide();
  await pagehide();
  assert.equal(puts(view).length, 1);
});

test('a body over 60,000 bytes is sent without keepalive, since browsers refuse it', async () => {
  const view = await openEditor();
  const big = 'a'.repeat(61000);
  await act(async () => editor.setContent(big, `<p>${big}</p>`));
  await hide();
  assert.equal(puts(view).length, 1);
  assert.equal(puts(view)[0].keepalive, false);
});

test('the save status follows the flush: saved on success, error on failure', async () => {
  const ok = await openEditor({ 'PUT /works/w1/chapters/c1': { id: 'c1', wordCount: 2 } });
  await act(async () => editor.setContent('new words', '<p>new words</p>'));
  await hide();
  assert.equal(editor.state.saveStatus, 'saved');
  await ok.unmount();

  const failing = await openEditor({ 'PUT /works/w1/chapters/c1': new HttpError(500, 'boom') });
  await act(async () => editor.setContent('other words', '<p>other words</p>'));
  await hide();
  assert.equal(editor.state.saveStatus, 'error');
  await failing.unmount();
});
