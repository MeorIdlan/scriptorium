import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp } from './support/app.js';
import { flush, type, click } from './support/render.js';
import './support/focus.js';
import DailyGoalField from '../src/components/settings/DailyGoalField.jsx';

const today = { date: '2026-10-14', words: 120, goal: 800 };

function putGoal(body) {
  return { goal: body.goal };
}

test('the field loads the current goal (A1)', async () => {
  const view = await renderApp(h(DailyGoalField), { routes: { 'GET /progress/today': today } });
  await flush();
  assert.equal(view.container.querySelector('#daily-goal').value, '800');
  await view.unmount();
});

test('saving a goal sends it and shows confirmation (A1)', async () => {
  const view = await renderApp(h(DailyGoalField), {
    routes: { 'GET /progress/today': today, 'PUT /progress/goal': putGoal },
  });
  await flush();
  await type(view.container.querySelector('#daily-goal'), '500');
  await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Save goal'));
  await flush();
  const put = view.fetch.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body, { goal: 500 });
  assert.match(view.text(), /Goal saved/);
  await view.unmount();
});

test('an invalid goal is refused on the page and nothing is sent (A1)', async () => {
  const view = await renderApp(h(DailyGoalField), {
    routes: { 'GET /progress/today': today, 'PUT /progress/goal': putGoal },
  });
  await flush();
  await type(view.container.querySelector('#daily-goal'), '2.5');
  await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Save goal'));
  await flush();
  assert.equal(view.fetch.calls.filter((c) => c.method === 'PUT').length, 0);
  assert.match(view.text(), /whole number from 1 to 100000/);
  await view.unmount();
});

test('clearing the goal sends null (A1)', async () => {
  const view = await renderApp(h(DailyGoalField), {
    routes: { 'GET /progress/today': today, 'PUT /progress/goal': putGoal },
  });
  await flush();
  await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Clear goal'));
  await flush();
  const put = view.fetch.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body, { goal: null });
  assert.equal(view.container.querySelector('#daily-goal').value, '');
  await view.unmount();
});

// A save that is still in flight: the button stays focused and reads as busy,
// and a second press sends nothing
test('a focused Save goal keeps focus and sends nothing while the save is in flight', async () => {
  let finish;
  const view = await renderApp(h(DailyGoalField), {
    routes: {
      'GET /progress/today': today,
      'PUT /progress/goal': () => new Promise((resolve) => { finish = () => resolve(putGoal({ goal: 500 })); }),
    },
  });
  await flush();
  await type(view.container.querySelector('#daily-goal'), '500');
  const save = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Save goal');
  await click(save);
  assert.equal(save.getAttribute('aria-disabled'), 'true');
  save.focus();
  await click(save);
  assert.equal(view.fetch.calls.filter((c) => c.method === 'PUT').length, 1);
  assert.equal(document.activeElement === save, true);
  finish();
  await flush();
  assert.equal(save.getAttribute('aria-disabled'), null);
  await view.unmount();
});
