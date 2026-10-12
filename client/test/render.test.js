import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from './support/render.js';
import ContextUsed from '../src/components/panel/ContextUsed.jsx';

test('renders a .jsx component into the test DOM', async () => {
  const view = await render(createElement(ContextUsed, { context: { story: true } }));
  assert.match(view.container.textContent, /story details/);
  await view.unmount();
});
