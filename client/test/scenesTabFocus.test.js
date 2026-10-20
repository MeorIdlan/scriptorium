import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useEffect } from 'react';
import { renderApp } from './support/app.js';
import { act, click, flush } from './support/render.js';
import './support/focus.js';
import ScenesTab from '../src/components/panel/ScenesTab.jsx';
import { useEditor } from '../src/context/EditorContext.jsx';
import { markerHtml } from '../src/utils/scenes.js';

// Puts a chapter with three scene breaks into the editor, as the Editor would
function Seed({ html }) {
  const { loadContent } = useEditor();
  useEffect(() => {
    loadContent('c1', 'Intro', html);
  }, [html, loadContent]);
  return null;
}

// linkedom has no selection or execCommand. Removing a break selects it and runs
// the browser's delete; here the delete finds nothing to do, so the code's own
// fallback removes the marker, which is what a refused delete does in a browser
document.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
document.execCommand = () => false;

const html = [
  '<p>Intro</p>',
  markerHtml({ id: 'scn_a', title: 'Alpha' }), '<p>Alpha text</p>',
  markerHtml({ id: 'scn_b', title: 'Beta' }), '<p>Beta text</p>',
  markerHtml({ id: 'scn_c', title: 'Gamma' }), '<p>Gamma text</p>',
].join('');

// The Editor swaps in a replacement's HTML and reports the new content, as after a scene move; this does the same for the editor root
function Replace() {
  const { state, setContent, clearReplacement } = useEditor();
  useEffect(() => {
    const root = document.querySelector('.editor');
    if (!state.pendingReplacement || !root) return;
    root.innerHTML = state.pendingReplacement.html;
    setContent(root.innerText || '', root.innerHTML);
    clearReplacement();
  }, [state.pendingReplacement, setContent, clearReplacement]);
  return null;
}

// The scene list is read from the editor DOM a moment after it loads
async function mountTab({ routes = {} } = {}) {
  const root = document.createElement('div');
  root.className = 'editor';
  root.innerHTML = html;
  document.body.appendChild(root);
  const view = await renderApp(h('div', null, h(Seed, { html }), h(Replace), h(ScenesTab, { workId: 'w1' })), {
    routes: { 'GET /works/w1/threads': [], 'GET /works/w1/codex': {}, ...routes },
  });
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  await flush();
  return { view, root };
}

const rowsOf = (view) => [...view.container.querySelectorAll('.scene-row')];
const removeBreak = (row) => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove break');
async function removeScene(view, row) {
  await click(removeBreak(row));
  await click([...view.container.querySelectorAll('.scene-row-confirm button')].find((b) => b.textContent.trim() === 'Remove'));
}

test('removing a scene break in the middle moves focus to the next scene', async () => {
  const { view, root } = await mountTab();
  assert.equal(rowsOf(view).length, 4);
  await removeScene(view, rowsOf(view)[2]);
  assert.equal(document.activeElement === rowsOf(view)[3].querySelector('button'), true);
  await view.unmount();
  root.remove();
});

test('removing the last scene break moves focus to the previous scene', async () => {
  const { view, root } = await mountTab();
  await removeScene(view, rowsOf(view)[3]);
  assert.equal(document.activeElement === rowsOf(view)[2].querySelector('button'), true);
  await view.unmount();
  root.remove();
});

// The editor's chapter after Beta moves down past Gamma, as the server returns it
const moved = [
  '<p>Intro</p>',
  markerHtml({ id: 'scn_a', title: 'Alpha' }), '<p>Alpha text</p>',
  markerHtml({ id: 'scn_c', title: 'Gamma' }), '<p>Gamma text</p>',
  markerHtml({ id: 'scn_b', title: 'Beta' }), '<p>Beta text</p>',
].join('');

async function moveBetaDown(view) {
  const beta = rowsOf(view)[2];
  await click(beta.querySelector('[aria-label="Move down"]'));
  // The list is read from the editor DOM a moment after the move lands
  await act(async () => new Promise((r) => setTimeout(r, 350)));
  await flush();
  return rowsOf(view)[3];
}

const moveRoutes = {
  'POST /works/w1/chapters/c1/scenes/move': { chapters: [{ id: 'c1', title: 'Intro', content: '', contentHtml: moved }] },
  'GET /works/w1/chapters': [],
  'GET /works/w1/threads': [],
  'GET /works/w1/codex': {},
};

// The move lands focus on the moved scene's button when focus is on a container that holds the rows
test('after a move, focus goes to the moved scene when focus sits on a container that holds it', async () => {
  const { view, root } = await mountTab({ routes: moveRoutes });
  view.container.focus();
  const betaRow = await moveBetaDown(view);
  assert.equal(document.activeElement === betaRow.querySelector('[aria-label="Move up"]'), true);
  await view.unmount();
  root.remove();
});

test('after a move, focus is left alone when the writer has moved to an unrelated element', async () => {
  const { view, root } = await mountTab({ routes: moveRoutes });
  const search = document.createElement('input');
  document.body.appendChild(search);
  search.focus();
  await moveBetaDown(view);
  assert.equal(document.activeElement === search, true);
  search.remove();
  await view.unmount();
  root.remove();
});

