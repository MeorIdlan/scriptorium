import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { act, click, flush, press } from './support/render.js';
import { renderApp, aiSettings, HttpError } from './support/app.js';
import { useAiState } from '../src/context/AiContext.jsx';
import { useUI } from '../src/context/UIContext.jsx';
import RightPanel from '../src/components/panel/RightPanel.jsx';
import Toolbar from '../src/components/editor/Toolbar.jsx';
import ChapterSummaryModal from '../src/components/overlays/ChapterSummaryModal.jsx';

let aiState;
let ui;
function Probe() {
  aiState = useAiState();
  ui = useUI();
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

test('the panel waits for the AI state instead of opening on Scenes first', async () => {
  let answer;
  const view = await renderApp(h(RightPanel, { workId: 'w1' }), {
    routes: { ...routes, 'GET /settings': () => new Promise((resolve) => { answer = resolve; }) },
  });
  assert.equal(view.queryAll('.panel-tab').length, 0);
  await act(async () => answer(aiSettings(true)));
  await flush();
  assert.equal(view.query('.panel-tab.active').textContent, 'Quill');
  await view.unmount();
});

test('turning AI off closes the hook generator', async () => {
  const view = await renderApp(h(Fragment, null, h(Probe), h(RightPanel, { workId: 'w1' })), { ai: true, routes });
  await act(async () => ui.dispatch({ type: 'TOGGLE_HOOK_GENERATOR' }));
  assert.equal(ui.state.hookGeneratorOpen, true);
  await act(async () => aiState.setAiState(aiSettings(false)));
  await act(async () => aiState.setAiState(aiSettings(true)));
  assert.equal(ui.state.hookGeneratorOpen, false);
  await view.unmount();
});

test('the panel still opens, without Quill, when settings fail to load', async () => {
  const view = await renderApp(h(RightPanel, { workId: 'w1' }), {
    routes: { ...routes, 'GET /settings': new HttpError(500, 'INTERNAL', 'down') },
  });
  assert.deepEqual(tabLabels(view), ['Scenes', 'Codex', 'Catch']);
  await view.unmount();
});

test('the summary dialog is a labelled dialog, and Esc on a field inside it closes it', async () => {
  let dismissed = 0;
  const view = await renderApp(h(ChapterSummaryModal, { workId: 'w1', chapterId: 'c1', onDismiss() { dismissed++; } }), {
    ai: true,
    routes,
  });
  assert.ok(view.query('[role="dialog"]'));
  await press(view.button('Edit'), 'Escape');
  assert.equal(dismissed, 1);
  await view.unmount();
});
