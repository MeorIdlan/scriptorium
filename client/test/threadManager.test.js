import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp, HttpError } from './support/app.js';
import { click, type, press, blur, pressThenBlur } from './support/render.js';
import ThreadManager from '../src/components/map/ThreadManager.jsx';

const heir = { id: 'thr_1', name: 'The missing heir', color: '#c9a96e', description: 'Who is Ada?', status: 'open', order: 0 };
const chapters = [
  { id: 'c1', title: 'One', threadIds: ['thr_1'], scenes: [{ id: 'scn_a', threadIds: ['thr_1'] }, { id: 'scn_b', threadIds: [] }] },
];

function mount({ threads = [heir], routes = {} } = {}) {
  let changed = 0;
  let deleted = 0;
  const onChanged = async () => {
    changed += 1;
  };
  const onDeleted = async () => {
    deleted += 1;
  };
  return renderApp(h(ThreadManager, { workId: 'w1', threads, chapters, onChanged, onDeleted }), { routes }).then((view) => ({
    ...view,
    changed: () => changed,
    deleted: () => deleted,
    writes: () => view.fetch.calls.filter((c) => c.path.startsWith('/works/w1/threads')),
  }));
}

test('shows an empty state with no threads', async () => {
  const view = await mount({ threads: [] });
  assert.match(view.text(), /No plot threads yet/);
  await view.unmount();
});

test('lists threads with their status and description', async () => {
  const view = await mount();
  assert.match(view.text(), /The missing heir/);
  assert.match(view.text(), /Who is Ada\?/);
  assert.equal(view.query('.thread-status').textContent, 'Open');
  await view.unmount();
});

test('creates a thread from the new-thread field', async () => {
  const view = await mount({ routes: { 'POST /works/w1/threads': { id: 'thr_2', name: 'Lost letter' } } });
  await click(view.button('New thread'));
  const input = view.query('.thread-new-name');
  await type(input, '  Lost letter ');
  await press(input, 'Enter');
  assert.deepEqual(view.writes(), [{ method: 'POST', path: '/works/w1/threads', body: { name: 'Lost letter' } }]);
  assert.equal(view.changed(), 1);
  assert.equal(view.query('.thread-new-name'), null);
  await view.unmount();
});

test('toggles the status', async () => {
  const view = await mount();
  await click(view.query('.thread-status'));
  assert.deepEqual(view.writes(), [{ method: 'PUT', path: '/works/w1/threads/thr_1', body: { status: 'resolved' } }]);
  await view.unmount();
});

test('renames, and keeps the typed name when the server refuses it', async () => {
  const view = await mount({
    routes: { 'PUT /works/w1/threads/thr_1': new HttpError(409, 'DUPLICATE_NAME', 'A thread named "Debt" already exists') },
  });
  await click(view.query('.thread-name'));
  const input = view.query('.thread-name-input');
  await type(input, 'Debt');
  await press(input, 'Enter');
  assert.deepEqual(view.writes()[0].body, { name: 'Debt' });
  assert.match(view.text(), /A thread named "Debt" already exists/);
  assert.equal(view.query('.thread-name-input').value, 'Debt');
  assert.equal(view.changed(), 0);
  await view.unmount();
});

test('recolours from the palette', async () => {
  const view = await mount();
  await click(view.query('.thread-swatch'));
  await click(view.query('[aria-label="Colour #7fa7d9"]'));
  assert.deepEqual(view.writes()[0].body, { color: '#7fa7d9' });
  assert.equal(view.query('.thread-palette'), null);
  await view.unmount();
});

test('edits the description on blur', async () => {
  const view = await mount();
  await click(view.query('.thread-desc'));
  const area = view.query('.thread-desc-input');
  await type(area, 'Ada is the heir.');
  await blur(area);
  assert.deepEqual(view.writes()[0].body, { description: 'Ada is the heir.' });
  await view.unmount();
});

test('asks before deleting and says how many tags go', async () => {
  const view = await mount();
  await click(view.button('Delete'));
  assert.match(view.text(), /Delete "The missing heir"\? It's tagged on 2 chapters and scenes/);
  assert.equal(view.writes().length, 0);
  await click(view.button('Delete thread'));
  assert.deepEqual(view.writes(), [{ method: 'DELETE', path: '/works/w1/threads/thr_1', body: undefined }]);
  assert.equal(view.changed(), 1);
  await view.unmount();
});

test('a status click is not lost while a description save is in flight', async () => {
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const view = await mount({
    routes: { 'PUT /works/w1/threads/thr_1': (body) => (body.description ? slow.then(() => ({})) : {}) },
  });
  await click(view.query('.thread-desc'));
  const area = view.query('.thread-desc-input');
  await type(area, 'Ada is the heir.');
  await blur(area); // the browser blurs the textarea before the click lands
  await click(view.query('.thread-status'));
  release();
  await click(view.query('.thread-name')); // lets the slow reply settle
  assert.deepEqual(
    view.writes().map((w) => w.body),
    [{ description: 'Ada is the heir.' }, { status: 'resolved' }],
  );
  await view.unmount();
});

test('Escape on the name cancels the rename even if the input blurs as it unmounts', async () => {
  const view = await mount();
  await click(view.query('.thread-name'));
  const input = view.query('.thread-name-input');
  await type(input, 'Debt');
  await pressThenBlur(input, 'Escape');
  assert.equal(view.writes().length, 0);
  await view.unmount();
});

test('Escape on the description cancels the edit even if the textarea blurs as it unmounts', async () => {
  const view = await mount();
  await click(view.query('.thread-desc'));
  const area = view.query('.thread-desc-input');
  await type(area, 'Changed');
  await pressThenBlur(area, 'Escape');
  assert.equal(view.writes().length, 0);
  await view.unmount();
});

test('a new thread is posted once even if the input blurs after Enter', async () => {
  const view = await mount({ routes: { 'POST /works/w1/threads': { id: 'thr_2', name: 'Lost letter' } } });
  await click(view.button('New thread'));
  const input = view.query('.thread-new-name');
  await type(input, 'Lost letter');
  await pressThenBlur(input, 'Enter', 3);
  assert.equal(view.writes().filter((w) => w.method === 'POST').length, 1);
  await view.unmount();
});

test('Escape on a new thread posts nothing even if the input blurs', async () => {
  const view = await mount();
  await click(view.button('New thread'));
  const input = view.query('.thread-new-name');
  await type(input, 'Lost letter');
  await pressThenBlur(input, 'Escape');
  assert.equal(view.writes().length, 0);
  await view.unmount();
});

test('Escape on a refused rename clears the row error without another request', async () => {
  const view = await mount({
    routes: { 'PUT /works/w1/threads/thr_1': new HttpError(409, 'DUPLICATE_NAME', 'A thread named "Debt" already exists') },
  });
  await click(view.query('.thread-name'));
  const input = view.query('.thread-name-input');
  await type(input, 'Debt');
  await press(input, 'Enter');
  assert.match(view.text(), /A thread named "Debt" already exists/);
  await press(view.query('.thread-name-input'), 'Escape');
  assert.equal(view.query('.thread-name-input'), null);
  assert.doesNotMatch(view.text(), /already exists/);
  assert.equal(view.writes().length, 1);
  await view.unmount();
});

test('tells the page after a delete so chapter tags can be reloaded', async () => {
  const view = await mount();
  await click(view.button('Delete'));
  await click(view.button('Delete thread'));
  assert.equal(view.deleted(), 1);
  await view.unmount();
});

test('does not call onDeleted for other writes', async () => {
  const view = await mount();
  await click(view.query('.thread-status'));
  assert.equal(view.deleted(), 0);
  await view.unmount();
});
