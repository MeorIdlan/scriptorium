import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
// render.js goes first: it sets the DOM globals react-dom reads when it loads
import { render, cleanup, click, press, act, flush } from './support/render.js';
import { createElement as h } from 'react';
import { createPortal } from 'react-dom';
import { setViewport, resetViewport } from './support/viewport.js';
import './support/focus.js';
import { UIProvider, useUI } from '../src/context/UIContext.jsx';
import { useDrawer } from '../src/hooks/useDrawer.js';
import DrawerBackdrop from '../src/components/layout/DrawerBackdrop.jsx';
import SceneRow from '../src/components/panel/SceneRow.jsx';
import CatchRow from '../src/components/panel/CatchRow.jsx';

afterEach(async () => {
  await cleanup();
  resetViewport();
});

let ui;
function Host({ children }) {
  ui = useUI();
  const d = useDrawer('panel', 'bottom', 'Panel');
  return h('div', null, h('div', { className: 'sheet', ...d.attrs }, children), h(DrawerBackdrop));
}

async function mountOpen(children) {
  const view = await render(h(UIProvider, null, h(Host, null, children)));
  await act(async () => ui.dispatch({ type: 'OPEN_DRAWER', name: 'panel' }));
  await flush();
  return view;
}

const button = (view, label) => [...view.container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('Esc that cancels a catch edit does not close the sheet around it', async () => {
  const item = { id: 'c1', content: 'A lighthouse keeper', status: 'open', taggedChapterId: null, capturedDuringChapterId: null, createdAt: '2026-10-01T00:00:00.000Z' };
  const view = await mountOpen(h(CatchRow, { item, chapters: [], showChapter: false, canInsert: false, defaultMapChapterId: null, onAction: async () => ({ ok: true }) }));
  await click(button(view, 'Edit'));
  await press(view.container.querySelector('.catch-edit-text'), 'Escape');
  assert.equal(view.container.querySelector('.catch-edit-text'), null);
  assert.equal(ui.state.drawer, 'panel');
});

test('Esc that cancels a scene card edit does not close the sheet around it', async () => {
  const scene = { id: 's1', title: 'The pier', pov: '', location: '', status: 'draft', summary: '', threadIds: [], wordCount: 0 };
  const view = await mountOpen(h(SceneRow, { scene, characters: [], places: [], onJump() {}, onSave() {}, onRemove() {} }));
  await click(button(view, 'Edit card'));
  await press(view.container.querySelector('.scene-card-form'), 'Escape');
  assert.equal(view.container.querySelector('.scene-card-form'), null);
  assert.equal(ui.state.drawer, 'panel');
});

test('Tab inside a portalled modal is left to the modal, not trapped by the drawer under it', async () => {
  // React events bubble from a portal to its React parent, here the drawer
  const modal = createPortal(h('button', { id: 'in-modal' }, 'ok'), document.body);
  const view = await mountOpen(h('div', null, h('button', { id: 'in-sheet' }, 'a'), modal));
  const inModal = document.getElementById('in-modal');
  inModal.focus();
  await press(inModal, 'Tab');
  assert.ok(document.activeElement === inModal, 'Tab was pulled out of the modal');
  await press(inModal, 'Escape');
  assert.equal(ui.state.drawer, 'panel', 'Esc in the modal must not close the drawer');
  assert.ok(view);
});

test('no backdrop is drawn on desktop, even for a drawer left open a moment ago', async () => {
  setViewport(1280);
  const view = await mountOpen(h('span', null, 'x'));
  assert.equal(ui.state.drawer, 'panel');
  assert.ok(view.container.querySelector('.drawer-backdrop') === null, 'a backdrop was drawn on desktop');
});
