import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, flush } from './support/render.js';
import { renderApp } from './support/app.js';
import { useAiState } from '../src/context/AiContext.jsx';
import { useAI } from '../src/hooks/useAI.js';

let state;
let ai;
function Probe() {
  state = useAiState();
  ai = useAI();
  return h('p', null, state.aiOn ? 'ai on' : 'ai off');
}

test('AI is on when the server reports it enabled and available', async () => {
  const view = await renderApp(h(Probe), { ai: true });
  assert.equal(view.text(), 'ai on');
  assert.equal(state.ready, true);
  await view.unmount();
});

test('AI is off when the server reports it off', async () => {
  const view = await renderApp(h(Probe), { ai: false });
  assert.equal(view.text(), 'ai off');
  await view.unmount();
});

test('AI counts as off when settings fail to load', async () => {
  const view = await renderApp(h(Probe), { ai: true, routes: { 'GET /settings': () => { throw new Error('down'); } } });
  assert.equal(view.text(), 'ai off');
  await view.unmount();
});

test('setAiState switches AI without remounting', async () => {
  const view = await renderApp(h(Probe), { ai: false });
  const p = view.query('p');
  await act(async () => state.setAiState({ aiEnabled: true, aiAvailable: true }));
  assert.equal(view.text(), 'ai on');
  assert.ok(view.query('p') === p, 'probe was remounted');
  await act(async () => state.setAiState({ aiEnabled: false, aiAvailable: true }));
  assert.equal(view.text(), 'ai off');
  await view.unmount();
});

test('refresh re-reads the AI state from the server', async () => {
  const view = await renderApp(h(Probe), { ai: false });
  view.setServerAi(true);
  await act(async () => state.refresh());
  await flush();
  assert.equal(view.text(), 'ai on');
  await view.unmount();
});

test('useAI sends no request while AI is off', async () => {
  const view = await renderApp(h(Probe), { ai: false });
  let reply;
  await act(async () => { reply = await ai.call('hooks', { workId: 'w1' }); });
  assert.equal(reply, null);
  assert.deepEqual(view.fetch.aiCalls(), []);
  await view.unmount();
});

test('useAI calls the AI endpoint while AI is on', async () => {
  const view = await renderApp(h(Probe), { ai: true, routes: { 'POST /ai/hooks': { hooks: [] } } });
  await act(async () => { await ai.call('hooks', {}); });
  assert.deepEqual(view.fetch.aiCalls().map((c) => c.path), ['/ai/hooks']);
  await view.unmount();
});
