import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { act, click, flush } from './support/render.js';
import './support/focus.js';
import UserManagement from '../src/pages/admin/UserManagement.jsx';

// user_1 is the signed-in admin (renderApp's default), so its own row can't be deleted
let users;
const routes = {
  'GET /admin/users': () => users,
  'DELETE /admin/users/u2': () => {
    users = users.filter((u) => u.id !== 'u2');
    return {};
  },
  'DELETE /admin/users/u3': () => {
    users = users.filter((u) => u.id !== 'u3');
    return {};
  },
};

const all = () => [
  { id: 'user_1', email: 'admin@example.com', name: 'Admin', emailVerified: true, isAdmin: true, createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 'u2', email: 'two@example.com', name: 'Two', emailVerified: true, isAdmin: false, createdAt: '2026-10-02T00:00:00.000Z' },
  { id: 'u3', email: 'three@example.com', name: 'Three', emailVerified: true, isAdmin: false, createdAt: '2026-10-03T00:00:00.000Z' },
];

const deleteButton = (view, index) => view.queryAll('.admin-users-table tbody tr button')[index];

// A keyboard press focuses the button before its click
async function pressButton(el) {
  el.focus();
  await click(el);
}

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
}

// Runs a scenario on a fresh list; unmounts even when an assertion fails
async function scenario(run) {
  users = all();
  const view = await renderApp(h(UserManagement), { routes });
  try {
    await flush();
    await run(view);
  } finally {
    await view.unmount();
  }
}

// Delete is two presses: the first asks for confirmation
async function confirmDelete(view, index) {
  await pressButton(deleteButton(view, index));
  await pressButton(deleteButton(view, index));
  await settle();
}

test('deleting a user moves focus to the next row’s Delete', async () => {
  await scenario(async (view) => {
    await confirmDelete(view, 1);
    assert.equal(view.queryAll('.admin-users-table tbody tr').length, 2);
    assert.equal(document.activeElement === deleteButton(view, 1), true);
  });
});

test('deleting the last user moves focus to the previous row’s Delete', async () => {
  await scenario(async (view) => {
    await confirmDelete(view, 2);
    assert.equal(view.queryAll('.admin-users-table tbody tr').length, 2);
    assert.equal(document.activeElement === deleteButton(view, 1), true);
  });
});
