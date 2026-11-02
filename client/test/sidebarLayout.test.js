// The sidebar's gothic ornaments (card uqVctsf5): a rose window beside the brand and a
// geometric icon, drawn in CSS, in front of every room name. Behaviour is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import Sidebar from '../src/components/layout/Sidebar.jsx';

const ICONS = {
  Shelves: 'ic-shelves',
  'Main Room': 'ic-room',
  Map: 'ic-map',
  Codex: 'ic-codex',
  'Manage Users': 'ic-users',
  Settings: 'ic-settings',
  'Log out': 'ic-out',
};

async function openSidebar() {
  return renderApp(h(Sidebar), {
    path: '/work/w1',
    route: '/work/:workId',
    routes: { 'GET /auth/me': { id: 'user_1', email: 'w@example.com', scope: 'full', isAdmin: true } },
  });
}

test('every sidebar entry has a drawn icon and no glyph character', async () => {
  const view = await openSidebar();
  const items = view.queryAll('.sidebar-nav-item');
  const labels = items.map((i) => i.querySelector('.sidebar-nav-label').textContent);
  assert.deepEqual(labels, Object.keys(ICONS));
  for (const item of items) {
    const label = item.querySelector('.sidebar-nav-label').textContent;
    const icon = item.querySelector('.sidebar-nav-icon');
    assert.ok(icon.classList.contains('ic'), `${label} has no .ic icon`);
    assert.ok(icon.classList.contains(ICONS[label]), `${label} should use ${ICONS[label]}`);
    assert.equal(icon.textContent, '', `${label} icon still holds a glyph`);
    assert.equal(icon.getAttribute('aria-hidden'), 'true', `${label} icon is not hidden from screen readers`);
  }
  await view.unmount();
});

test('the brand carries a rose window and its link still reads Scriptorium', async () => {
  const view = await openSidebar();
  const link = view.query('.sidebar-brand-link');
  assert.ok(link.querySelector('.rose'), 'no rose beside the brand');
  assert.equal(link.textContent, 'Scriptorium');
  await view.unmount();
});

test('the sidebar is a navigation landmark named Rooms', async () => {
  const view = await openSidebar();
  assert.equal(view.query('nav.sidebar').getAttribute('aria-label'), 'Rooms');
  await view.unmount();
});
