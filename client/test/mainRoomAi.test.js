import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { act, click } from './support/render.js';
import { renderApp, aiSettings, HttpError } from './support/app.js';
import { useAiState } from '../src/context/AiContext.jsx';
import RightPanel from '../src/components/panel/RightPanel.jsx';
import Toolbar from '../src/components/editor/Toolbar.jsx';
import ChapterSummaryModal from '../src/components/overlays/ChapterSummaryModal.jsx';

let aiState;
function Probe() {
  aiState = useAiState();
  return null;
}

const work = { id: 'w1', title: 'Book', wordCount: 1200 };
const routes = {
  'GET /works/w1': work,
  'GET /works/w1/chapters': [{ id: 'c1', title: 'One', wordCount: 1200, summaryStatus: 'none' }],
  'GET /works/w1/sessions/latest': {},
  'GET /works/w1/catches': [],
  'GET /works/w1/codex': {},
  'GET /works/w1/map': {},
};

function tabLabels(view) {
  return view.queryAll('.panel-tab').map((b) => b.textContent);
}

test('with AI off the Quill tab is gone and the panel opens on Scenes', async () => {
  const view = await renderApp(h(RightPanel, { workId: 'w1' }), {
    ai: false,
    routes: { ...routes, 'GET /settings': { ...aiSettings(false), autoFeatures: { rekindler: 'auto' } } },
  });
  assert.deepEqual(tabLabels(view), ['Scenes', 'Codex', 'Catch']);
  assert.equal(view.query('.panel-tab.active').textContent, 'Scenes');
  // Rekindler lives in the Quill tab, so it never asks for a summary
  assert.deepEqual(view.fetch.aiCalls(), []);
  await view.unmount();
});

test('with AI on the panel shows the Quill tab first', async () => {
  const view = await renderApp(h(RightPanel, { workId: 'w1' }), { ai: true, routes });
  assert.deepEqual(tabLabels(view), ['Quill', 'Scenes', 'Codex', 'Catch']);
  assert.equal(view.query('.panel-tab.active').textContent, 'Quill');
  assert.ok(view.hasButton('pacing'));
  await view.unmount();
});

test('with AI off the other panel tabs still open', async () => {
  const view = await renderApp(h(RightPanel, { workId: 'w1' }), { ai: false, routes });
  await click(view.button('Catch'));
  assert.equal(view.query('.panel-tab.active').textContent, 'Catch');
  await view.unmount();
});

test('turning AI on brings the Quill tab back without a reload', async () => {
  const view = await renderApp(h(Fragment, null, h(Probe), h(RightPanel, { workId: 'w1' })), { ai: false, routes });
  const panel = view.query('.right-panel');
  await act(async () => aiState.setAiState(aiSettings(true)));
  assert.deepEqual(tabLabels(view), ['Quill', 'Scenes', 'Codex', 'Catch']);
  assert.ok(view.query('.right-panel') === panel, 'panel was remounted');
  await act(async () => aiState.setAiState(aiSettings(false)));
  assert.deepEqual(tabLabels(view), ['Scenes', 'Codex', 'Catch']);
  await view.unmount();
});

test('with AI off the toolbar has no Spark or chapter summary button', async () => {
  const view = await renderApp(h(Toolbar, { editorRef: { current: null } }), { ai: false });
  assert.ok(view.hasButton('History'));
  assert.equal(view.hasButton('Summary'), false);
  assert.equal(view.hasButton('Spark'), false);
  await view.unmount();
});

test('with AI on the toolbar has the Spark and chapter summary buttons', async () => {
  const view = await renderApp(h(Toolbar, { editorRef: { current: null } }), { ai: true });
  assert.ok(view.hasButton('Summary'));
  assert.ok(view.hasButton('Spark'));
  await view.unmount();
});

test('the summary modal explains a missing API key', async () => {
  const view = await renderApp(h(ChapterSummaryModal, { workId: 'w1', chapterId: 'c1', onDismiss() {} }), {
    ai: true,
    routes: {
      ...routes,
      'POST /works/w1/chapters/c1/summary/regenerate': new HttpError(400, 'NO_API_KEY', 'No API key configured for anthropic'),
    },
  });
  await click(view.button('Generate'));
  assert.match(view.text(), /Please go to Settings to add your API key/);
  await view.unmount();
});
