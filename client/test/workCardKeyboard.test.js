import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { renderApp } from './support/app.js';
import { click, press } from './support/render.js';
import './support/focus.js';
import WorkCard from '../src/components/shelves/WorkCard.jsx';
import ExportModal from '../src/components/overlays/ExportModal.jsx';

const work = { id: 'w1', title: 'The Long Road', wordCount: 1200, status: 'active' };

// Shows where the router has taken the page, so a test can tell the card opened
function Location() {
  const { pathname } = useLocation();
  return h('span', { id: 'location' }, pathname);
}

function renderCard() {
  return renderApp(h(Fragment, null, h(WorkCard, { work, onDelete() {}, onExport() {} }), h(Location)));
}

const location = (view) => view.query('#location').textContent;

test('the work title is a button that opens the work', async () => {
  const view = await renderCard();
  const title = view.button('The Long Road');
  assert.equal(title.tagName.toLowerCase(), 'button');
  assert.equal(title.getAttribute('type'), 'button');
  await click(title);
  assert.equal(location(view), '/work/w1');
  await view.unmount();
});

test('activating the title button runs the same handler as clicking the card', async () => {
  const byCard = await renderCard();
  await click(byCard.query('.work-card'));
  const cardPath = location(byCard);
  await byCard.unmount();

  const byButton = await renderCard();
  await click(byButton.button('The Long Road'));
  assert.equal(location(byButton), cardPath);
  assert.equal(cardPath, '/work/w1');
  await byButton.unmount();
});

test('no button is nested inside another button, with the work menu open', async () => {
  const view = await renderCard();
  await click(view.query('[aria-label="Work options"]'));
  assert.ok(view.button('Archive'));
  const nested = view.queryAll('button').filter((b) => b.parentElement?.closest('button'));
  assert.equal(nested.length, 0);
  await view.unmount();
});

test('Export from the work menu, closed with Esc, returns focus to the menu button', async () => {
  const view = await renderApp(h(Fragment, null, h(WorkCard, { work, onDelete() {}, onExport() {} }), h(ExportModal)));
  const menu = view.query('.work-card-menu-btn');
  await click(menu);
  const exportItem = view.button('Export');
  exportItem.focus();
  await click(exportItem);
  const dialog = view.query('[role="dialog"]');
  assert.ok(dialog);
  await press(dialog, 'Escape');
  assert.equal(view.query('[role="dialog"]'), null);
  assert.equal(document.activeElement === menu, true);
  await view.unmount();
});
