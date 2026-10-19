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

// The scene list is read from the editor DOM a moment after it loads
async function mountTab() {
  const root = document.createElement('div');
  root.className = 'editor';
  root.innerHTML = html;
  document.body.appendChild(root);
  const view = await renderApp(h('div', null, h(Seed, { html }), h(ScenesTab, { workId: 'w1' })), {
    routes: { 'GET /works/w1/threads': [], 'GET /works/w1/codex': {} },
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
