import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderApp, HttpError } from './support/app.js';
import { click } from './support/render.js';
import { useActiveWork } from '../src/context/ActiveWorkContext.jsx';

function Probe() {
  const { state, loadWork, refreshThreads } = useActiveWork();
  const open = (id) => async () => {
    await loadWork(id);
    await refreshThreads(id);
  };
  return h('div', null,
    h('button', { onClick: open('wA') }, 'open A'),
    h('button', { onClick: open('wB') }, 'open B'),
    h('p', { className: 'names' }, state.threads.map((t) => t.name).join(',')));
}

test('threads of the previous work are not shown when the next work fails to load them', async () => {
  const view = await renderApp(h(Probe), {
    routes: {
      'GET /works/wA/threads': [{ id: 't1', name: 'Heir thread' }],
      'GET /works/wB/threads': new HttpError(500, 'BOOM', 'boom'),
    },
  });
  await click(view.button('open A'));
  assert.equal(view.query('.names').textContent, 'Heir thread');
  await click(view.button('open B'));
  assert.equal(view.query('.names').textContent, '');
  await view.unmount();
});
