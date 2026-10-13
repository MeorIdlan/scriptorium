import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import { useEditor } from '../src/context/EditorContext.jsx';
import WordCounter from '../src/components/editor/WordCounter.jsx';

let editor;
function Driver() {
  editor = useEditor();
  return h(WordCounter);
}

const today = { date: '2026-10-14', words: 500, goal: 1000 };

test("the counter shows today's total against the goal (A2)", async () => {
  const view = await renderApp(h(Driver), { routes: { 'GET /progress/today': today } });
  await act(async () => editor.loadContent('ch_1', 'one two three', ''));
  await flush();
  assert.match(view.text(), /Today 500 \/ 1,000 words/);
  await view.unmount();
});

test('typing moves the total up before the next save (A2)', async () => {
  const view = await renderApp(h(Driver), { routes: { 'GET /progress/today': today } });
  await act(async () => editor.loadContent('ch_1', 'one two three', ''));
  await flush();
  await act(async () => editor.setContent('one two three four', ''));
  await flush();
  assert.match(view.text(), /Today 501 \/ 1,000 words/);
  await view.unmount();
});

test('with no goal the counter shows today only', async () => {
  const view = await renderApp(h(Driver), { routes: { 'GET /progress/today': { ...today, goal: null } } });
  await act(async () => editor.loadContent('ch_1', 'one two three', ''));
  await flush();
  assert.match(view.text(), /Today 500 words/);
  assert.doesNotMatch(view.text(), /\//);
  await view.unmount();
});
