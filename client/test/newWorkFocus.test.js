import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { click, type } from './support/render.js';
// app.js loads the DOM globals react-dom needs before react-router-dom loads it
import { renderApp } from './support/app.js';
import { useLocation } from 'react-router-dom';
import './support/focus.js';
import NewWorkWizard from '../src/components/shelves/NewWorkWizard.jsx';

// Records where the wizard navigated and the state it passed along
const arrival = {};
function LocationProbe() {
  const location = useLocation();
  arrival.path = location.pathname;
  arrival.state = location.state;
  return null;
}

async function toReview(view) {
  await type(view.query('input.form-input'), 'The Long Road');
  await click(view.button('Next'));
  await click(view.button('Next'));
}

test('Create Work tells the Main Room to focus the editor once the chapter is in', async () => {
  const view = await renderApp(h('div', null, h(NewWorkWizard, { onClose() {} }), h(LocationProbe)), {
    ai: false,
    routes: { 'POST /works': (body) => ({ id: 'w9', ...body }) },
  });
  await toReview(view);
  await click(view.button('Create Work'));
  assert.equal(arrival.path, '/work/w9');
  assert.deepEqual(arrival.state, { focusEditor: true });
  await view.unmount();
});
